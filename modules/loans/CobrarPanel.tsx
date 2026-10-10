"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, Check, CreditCard, Landmark, Printer, Wallet, X } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/components/use-is-mobile";
import { AdjuntarImagen } from "@/components/ui/adjuntar-imagen";
import { CuentaPicker, useCuentas, SinCuentasAviso } from "@/components/ui/cuenta";
import { imprimirTicketNavegador } from "@/lib/ticket";
import { guardarComprobante } from "@/modules/sales/comprobantes";
import { asignarTerminalPago } from "@/modules/config/terminales";
import { recordarTerminal, TerminalPicker, useTerminalElegida, useTerminales } from "@/components/terminal-picker";
import { abonarFiado, settleLoan } from "@/modules/sales/actions";
import { quienDebe, resta as restaDe, ticketDeAbono, type PieNota } from "./estado-cuenta";
import type { Loan } from "./LoansView";

const METODOS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: "efectivo", label: "Efectivo", icon: Banknote },
  { value: "tarjeta", label: "Tarjeta", icon: CreditCard },
  { value: "transferencia", label: "Transfer.", icon: Landmark },
  { value: "otro", label: "Otro", icon: Wallet },
];

const aCentavos = (s: string) => Math.round((Number(s.replace(",", ".")) || 0) * 100);

/**
 * Collecting on a credit note: the whole rest, or a part of it.
 *
 * The change is the big number, the way it is at the till — the seller says it
 * out loud — and the ticket prints itself unless someone turns it off, because
 * a customer paying off a debt expects paper.
 */
export function CobrarPanel({
  open,
  loan,
  pie,
  comprobanteObligatorio = false,
  verComision = false,
  onClose,
  onListo,
}: {
  open: boolean;
  loan: Loan;
  pie: PieNota;
  comprobanteObligatorio?: boolean;
  /** Show the terminal's commission and what lands in the account. */
  verComision?: boolean;
  onClose: () => void;
  onListo: () => void;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const falta = restaDe(loan);
  const [modo, setModo] = useState<"todo" | "parte">("todo");
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<PaymentMethod>("efectivo");
  const [recibido, setRecibido] = useState("");
  const [referencia, setReferencia] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const [imprimir, setImprimir] = useState(true);
  const cuentas = useCuentas();
  const listaCuentas = cuentas ?? [];
  const sinCuentas = cuentas !== null && cuentas.length === 0;
  const [pending, start] = useTransition();
  const terminales = useTerminales();
  const [terminalId, setTerminalId] = useTerminalElegida(terminales, open);

  useEffect(() => {
    if (!open) return;
    setModo("todo");
    setMonto("");
    setMetodo("efectivo");
    setRecibido("");
    setReferencia("");
    setFoto(null);
    setCuentaId(null);
    setImprimir(true);
  }, [open]);

  const cobro = modo === "todo" ? falta : Math.min(aCentavos(monto), falta);
  const recibidoCents = aCentavos(recibido);
  const cambio = recibidoCents - cobro;
  const insuficiente = metodo === "efectivo" && recibido.trim() !== "" && recibidoCents < cobro;
  const faltaCuenta = metodo === "transferencia" && (listaCuentas.length > 0 ? !cuentaId : sinCuentas);
  const faltaComprobante = comprobanteObligatorio && metodo === "transferencia" && !referencia.trim() && !foto;
  const pideTerminal = metodo === "tarjeta" && (terminales?.length ?? 0) > 0;
  const faltaTerminal = pideTerminal && !terminalId;
  const puede = cobro > 0 && !insuficiente && !faltaCuenta && !faltaComprobante && !faltaTerminal && !pending;

  const sugerencias = useMemo(() => {
    const paso = [10000, 20000, 50000];
    return [...new Set(paso.filter((p) => p < falta))].slice(0, 3);
  }, [falta]);

  function cobrar() {
    if (!puede) return;
    const liquida = cobro >= falta;
    start(async () => {
      try {
        if (liquida) await settleLoan(loan.id, metodo);
        else await abonarFiado(loan.id, cobro / 100, metodo);

        // The abono's terminal, recorded after it like a transfer's proof.
        if (pideTerminal && terminalId) {
          recordarTerminal(terminalId);
          const rt = await asignarTerminalPago({ saleId: loan.id }, terminalId);
          if (!rt.ok) toast.error(`Cobro ok, pero la terminal no se registró: ${rt.error}`);
        }

        if (metodo === "transferencia" && (referencia.trim() || foto || cuentaId)) {
          let form: FormData | undefined;
          if (foto) {
            form = new FormData();
            form.append("file", foto);
          }
          const rc = await guardarComprobante(loan.id, referencia.trim() || null, form, cuentaId);
          if (!rc.ok) toast.error(`Cobro ok, pero el comprobante no se guardó: ${rc.error}`);
        }

        if (imprimir) {
          imprimirTicketNavegador(
            ticketDeAbono(
              loan,
              { monto_cents: cobro, metodo, created_at: new Date().toISOString() },
              Math.max(0, falta - cobro),
              pie,
            ),
          );
        }
        toast.success(
          liquida
            ? `Liquidado · ${quienDebe(loan)} ya no debe nada`
            : `Abonó ${formatMXN(cobro)} · restan ${formatMXN(falta - cobro)}`,
        );
        onListo();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo cobrar");
      }
    });
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} swipeDirection={isMobile ? "down" : "right"} showSwipeHandle={isMobile}>
      <DrawerContent
        overlay={false}
        className="data-[swipe-direction=down]:top-16 data-[swipe-direction=down]:max-h-none data-[swipe-direction=right]:w-[min(480px,100vw)]"
      >
        <div className="flex items-start justify-between px-4 pt-1 pb-3 sm:px-6 sm:pt-5">
          <div>
            <DrawerTitle className="text-lg font-semibold sm:text-xl">Cobrar a {quienDebe(loan)}</DrawerTitle>
            <p className="text-sm text-muted-foreground">
              Nota del {new Date(loan.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })} · resta{" "}
              {formatMXN(falta)}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div data-base-ui-swipe-ignore className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">
          <div className="grid grid-cols-2 gap-2.5">
            {(
              [
                ["todo", "Liquidar todo"],
                ["parte", "Abonar una parte"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                aria-pressed={modo === k}
                onClick={() => setModo(k)}
                className={cn(
                  "h-11 cursor-pointer rounded-xl border text-sm font-medium",
                  modo === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Va a pagar</span>
              <span className="text-3xl font-bold tabular-nums">{formatMXN(cobro)}</span>
            </div>
            {modo === "parte" && (
              <>
                <div className="flex h-12 items-center gap-1 rounded-xl border border-border bg-background px-3">
                  <span className="text-muted-foreground">$</span>
                  <input
                    autoFocus
                    inputMode="decimal"
                    value={monto}
                    onChange={(e) => setMonto(e.target.value.replace(/[^\d.,]/g, ""))}
                    placeholder="0.00"
                    aria-label="Monto del abono"
                    className="w-full min-w-0 bg-transparent text-lg tabular-nums outline-hidden"
                  />
                </div>
                <div className="flex gap-2">
                  {sugerencias.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setMonto((c / 100).toFixed(2))}
                      className="h-10 flex-1 cursor-pointer rounded-full border border-border bg-background text-sm tabular-nums hover:bg-muted"
                    >
                      {formatMXN(c).replace(".00", "")}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setModo("todo")}
                    className="h-10 flex-1 cursor-pointer rounded-full border border-border bg-background text-sm hover:bg-muted"
                  >
                    Todo
                  </button>
                </div>
              </>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">¿Cómo paga?</legend>
            <div className="grid grid-cols-4 gap-2">
              {METODOS.map((m) => {
                const on = metodo === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setMetodo(m.value)}
                    className={cn(
                      "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-semibold",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                    )}
                  >
                    <m.icon className="h-5 w-5" />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {metodo === "efectivo" && (
            <div className="space-y-2.5 rounded-xl border border-border p-4">
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Recibido</span>
                <input
                  inputMode="decimal"
                  value={recibido}
                  onChange={(e) => setRecibido(e.target.value.replace(/[^\d.,]/g, ""))}
                  placeholder="0.00"
                  className="h-11 w-36 rounded-lg border border-border bg-background px-3 text-right text-lg font-semibold tabular-nums outline-hidden focus:ring-2 focus:ring-ring/30"
                />
              </label>
              <div
                className={cn(
                  "flex items-baseline justify-between border-t border-dashed border-border pt-2.5",
                  insuficiente ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400",
                )}
              >
                <span className="text-sm font-semibold">{insuficiente ? "Falta" : "Cambio"}</span>
                <span className="text-2xl font-bold tabular-nums">
                  {recibido.trim() ? formatMXN(Math.abs(cambio)) : "—"}
                </span>
              </div>
            </div>
          )}

          {pideTerminal && terminales && (
            <TerminalPicker
              terminales={terminales}
              value={terminalId}
              onChange={setTerminalId}
              montoCents={cobro}
              verComision={verComision}
            />
          )}

          {metodo === "transferencia" && (
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
              <CuentaPicker cuentas={listaCuentas} value={cuentaId} onChange={setCuentaId} label="¿A qué cuenta llegó?" />
              {sinCuentas && <SinCuentasAviso />}
              <Input
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder={`Referencia ${comprobanteObligatorio ? "(obligatoria)" : "(opcional)"}`}
                className="h-11 text-base sm:text-sm"
              />
              <AdjuntarImagen value={foto} onChange={setFoto} />
            </div>
          )}

          <button
            type="button"
            onClick={() => setImprimir((v) => !v)}
            aria-pressed={imprimir}
            className={cn(
              "flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left text-sm",
              imprimir ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30" : "border-border",
            )}
          >
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                imprimir ? "border-emerald-600 bg-emerald-600 text-white" : "border-border",
              )}
            >
              {imprimir && <Check className="h-4 w-4" />}
            </span>
            <span className="flex-1">Imprimir ticket al terminar</span>
            <Printer className="h-5 w-5 text-muted-foreground" />
          </button>

          {cobro >= falta && cobro > 0 && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
              Con esto la nota queda liquidada y sale de la lista.
            </p>
          )}
        </div>

        <div className="flex gap-2.5 border-t border-border px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <Button variant="secondary" className="hidden h-12 flex-1 sm:inline-flex" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button className="h-13 flex-2 text-base sm:h-12" onClick={cobrar} loading={pending} disabled={!puede}>
            <Check className="h-5 w-5" />
            Cobrar {formatMXN(cobro)}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
