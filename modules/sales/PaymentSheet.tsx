"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Banknote,
  CreditCard,
  Landmark,
  Wallet,
  Delete,
  Check,
  Split as SplitIcon,
  PiggyBank,
  TriangleAlert,
  X,
} from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PaymentMethodVenta } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/components/use-is-mobile";
import { AdjuntarImagen } from "@/components/ui/adjuntar-imagen";
import { CuentaPicker, useCuentas, SinCuentasAviso } from "@/components/ui/cuenta";

type Metodo = PaymentMethodVenta | "dividir";

const METODOS: { value: Metodo; label: string; icon: typeof Banknote }[] = [
  { value: "efectivo", label: "Efectivo", icon: Banknote },
  { value: "tarjeta", label: "Tarjeta", icon: CreditCard },
  { value: "transferencia", label: "Transfer.", icon: Landmark },
  { value: "otro", label: "Otro", icon: Wallet },
  { value: "saldo", label: "Saldo", icon: PiggyBank },
  { value: "dividir", label: "Dividir", icon: SplitIcon },
];

// Rows of a split payment: every real method, never "dividir" itself.
const PARTES = METODOS.filter((m) => m.value !== "dividir") as {
  value: PaymentMethodVenta;
  label: string;
  icon: typeof Banknote;
}[];

const ceilTo = (cents: number, step: number) => Math.ceil(cents / step) * step;
const aCentavos = (s: string) => Math.round((Number(s.replace(",", ".")) || 0) * 100);

export type Comprobante = { referencia: string | null; foto: File | null; cuentaId: string | null };

/**
 * "Cobrar": a side panel on the counter, a bottom sheet on a phone. Cash is
 * the common case, so it opens there with the keypad, and the change is the
 * biggest number on screen — it is what the seller says out loud.
 */
export function PaymentSheet({
  open,
  onClose,
  total,
  resumen,
  saldoDisponible,
  pending,
  comprobanteObligatorio = false,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  total: number; // cents
  /** "3 piezas · Taller El Güero" under the title. */
  resumen: string;
  /** This customer's store credit, in cents. 0 hides the method entirely. */
  saldoDisponible: number;
  pending: boolean;
  /** Shop rule: a transfer without its proof is not a payment. */
  comprobanteObligatorio?: boolean;
  onConfirm: (
    metodo: PaymentMethodVenta,
    pagos?: { metodo: PaymentMethodVenta; monto_cents: number }[],
    comprobante?: Comprobante,
  ) => void;
}) {
  const isMobile = useIsMobile();
  const [metodo, setMetodo] = useState<Metodo>("efectivo");
  const [recibido, setRecibido] = useState(""); // pesos, as typed
  const [montos, setMontos] = useState<Record<string, string>>({});
  // Transfer proof: attached AFTER the sale registers — a failed photo never
  // loses the sale.
  const [referencia, setReferencia] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const cuentas = useCuentas();
  const listaCuentas = cuentas ?? [];
  const sinCuentas = cuentas !== null && cuentas.length === 0;

  // Every opening is a new charge.
  useEffect(() => {
    if (!open) return;
    setMetodo("efectivo");
    setRecibido("");
    setMontos({});
    setReferencia("");
    setFoto(null);
    setCuentaId(null);
  }, [open]);

  const dividir = metodo === "dividir";
  const pagos = PARTES.map((m) => ({ metodo: m.value, monto_cents: aCentavos(montos[m.value] ?? "") })).filter(
    (p) => p.monto_cents > 0,
  );
  const asignado = pagos.reduce((s, p) => s + p.monto_cents, 0);
  const restante = total - asignado;
  // Store credit is the one method with a ceiling. Blocked rather than clamped:
  // silently lowering it would charge a different split than the one on screen.
  const saldoAsignado = pagos.find((p) => p.metodo === "saldo")?.monto_cents ?? 0;
  const saldoExcedido = saldoAsignado > saldoDisponible;
  const splitCuadra = dividir && restante === 0 && pagos.length > 0 && !saldoExcedido;

  const esEfectivo = metodo === "efectivo";
  const recibidoCents = aCentavos(recibido);
  const hayRecibido = esEfectivo && recibido.trim() !== "";
  const cambio = recibidoCents - total;
  const insuficiente = hayRecibido && recibidoCents < total;
  const alcanzaSaldo = metodo !== "saldo" || saldoDisponible >= total;
  const puedeSimple = (!hayRecibido || recibidoCents >= total) && alcanzaSaldo;

  const hayTransferencia = dividir ? pagos.some((p) => p.metodo === "transferencia") : metodo === "transferencia";
  const faltaComprobante = comprobanteObligatorio && hayTransferencia && !referencia.trim() && !foto;
  // A transfer MUST say where it landed — with no accounts registered at all
  // there is nowhere for it to land, so the method is blocked outright.
  const faltaCuenta = hayTransferencia && (listaCuentas.length > 0 ? !cuentaId : sinCuentas);
  const puedeCobrar = (dividir ? splitCuadra : puedeSimple) && !faltaComprobante && !faltaCuenta && !pending;

  const sugerencias = useMemo(() => {
    const opts = new Set<number>([total, ceilTo(total, 5000), ceilTo(total, 10000), ceilTo(total, 20000), ceilTo(total, 50000)]);
    return [...opts].filter((c) => c >= total).slice(0, 4);
  }, [total]);

  function press(k: string) {
    setRecibido((r) => {
      if (k === "del") return r.slice(0, -1);
      if (k === ".") return r.includes(".") ? r : r === "" ? "0." : r + ".";
      const next = (r + k).replace(/^0+(?=\d)/, "");
      if (next.includes(".") && next.split(".")[1].length > 2) return r;
      return next;
    });
  }

  function confirmar() {
    if (!puedeCobrar) return;
    const comp = referencia.trim() || foto || cuentaId ? { referencia: referencia.trim() || null, foto, cuentaId } : undefined;
    if (dividir) onConfirm("mixto" as PaymentMethodVenta, pagos, comp);
    else onConfirm(metodo, metodo === "saldo" ? [{ metodo, monto_cents: total }] : undefined, comp);
  }

  // The counter has a keyboard: type the amount received, Enter charges.
  const confirmarRef = useRef(confirmar);
  confirmarRef.current = confirmar;
  useEffect(() => {
    if (!open) return;
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Enter") {
        e.preventDefault();
        confirmarRef.current();
      } else if (metodo === "efectivo") {
        if (/^[0-9]$/.test(e.key)) press(e.key);
        else if (e.key === "." || e.key === ",") press(".");
        else if (e.key === "Backspace") press("del");
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [open, metodo]);

  const visibles = METODOS.filter((m) => m.value !== "saldo" || saldoDisponible > 0);

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      swipeDirection={isMobile ? "down" : "right"}
      showSwipeHandle={isMobile}
    >
      <DrawerContent className="data-[swipe-direction=down]:top-12 data-[swipe-direction=down]:max-h-none data-[swipe-direction=right]:w-[min(520px,100vw)]">
        <div className="flex items-start justify-between px-4 pt-1 pb-3 sm:px-6 sm:pt-5">
          <div>
            <DrawerTitle className="text-lg font-semibold sm:text-xl">Cobrar</DrawerTitle>
            <p className="text-sm text-muted-foreground">{resumen}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div data-base-ui-swipe-ignore className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">
          <div className="flex items-baseline justify-between rounded-2xl bg-primary px-4 py-3.5 text-primary-foreground">
            <span className="text-sm opacity-75">Total a cobrar</span>
            <span className="text-3xl font-bold tabular-nums tracking-tight">{formatMXN(total)}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {visibles.map((m) => {
              const on = metodo === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setMetodo(m.value);
                    if (m.value !== "efectivo") setRecibido("");
                  }}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-1 py-2.5 text-xs font-semibold transition-colors",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                  )}
                >
                  <m.icon className="h-5 w-5" />
                  {m.label}
                  {m.value === "saldo" && (
                    <span className={cn("text-[10px] font-normal", on ? "opacity-75" : "text-muted-foreground")}>
                      {formatMXN(saldoDisponible)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {esEfectivo && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <div className={cn("rounded-xl border bg-muted/40 px-3.5 py-2.5", insuficiente ? "border-red-300 dark:border-red-800" : "border-border")}>
                  <p className="text-xs text-muted-foreground">Recibido</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {recibido === "" ? <span className="text-muted-foreground/60">$0</span> : `$${recibido}`}
                  </p>
                </div>
                <div
                  className={cn(
                    "rounded-xl border px-3.5 py-2.5",
                    !hayRecibido
                      ? "border-border"
                      : insuficiente
                        ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
                  )}
                >
                  <p className="text-xs font-semibold">{insuficiente ? "Falta" : "Cambio"}</p>
                  <p className="text-2xl font-bold tabular-nums">{hayRecibido ? formatMXN(Math.abs(cambio)) : "—"}</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {sugerencias.map((c, i) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setRecibido(String(c / 100))}
                    className={cn(
                      "h-10 cursor-pointer rounded-full border text-sm tabular-nums",
                      recibidoCents === c && hayRecibido ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                    )}
                  >
                    {i === 0 ? "Exacto" : formatMXN(c).replace(".00", "")}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => press(k)}
                    aria-label={k === "del" ? "Borrar" : k}
                    className="flex h-13 cursor-pointer items-center justify-center rounded-xl border border-border bg-background text-xl font-semibold tabular-nums transition-colors hover:bg-muted active:bg-muted/70 sm:h-12"
                  >
                    {k === "del" ? <Delete className="h-5 w-5 text-muted-foreground" /> : k}
                  </button>
                ))}
              </div>
              <p className="hidden text-center text-xs text-muted-foreground sm:block">
                Escribe lo recibido con el teclado · Enter cobra
              </p>
            </div>
          )}

          {metodo === "saldo" && !alcanzaSaldo && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
              <p className="font-medium text-amber-900 dark:text-amber-200">El saldo no alcanza</p>
              <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                Tiene {formatMXN(saldoDisponible)}; faltan {formatMXN(total - saldoDisponible)}.
              </p>
              <button
                type="button"
                onClick={() => {
                  setMetodo("dividir");
                  setMontos({ saldo: (saldoDisponible / 100).toFixed(2) });
                }}
                className="mt-2 cursor-pointer text-xs font-medium text-amber-900 underline underline-offset-2 dark:text-amber-200"
              >
                Usar su saldo y cobrar la diferencia
              </button>
            </div>
          )}
          {metodo === "saldo" && alcanzaSaldo && saldoDisponible > total && (
            <p className="text-sm text-muted-foreground">Le quedarán {formatMXN(saldoDisponible - total)} a favor.</p>
          )}

          {dividir && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">¿Cómo se reparte?</p>
              {PARTES.filter((m) => m.value !== "saldo" || saldoDisponible > 0).map((m) => {
                const v = montos[m.value] ?? "";
                const on = aCentavos(v) > 0;
                return (
                  <label
                    key={m.value}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-2",
                      m.value === "saldo" && saldoExcedido ? "border-red-400" : on ? "border-primary" : "border-border",
                    )}
                  >
                    <m.icon className={cn("h-4.5 w-4.5", on ? "" : "text-muted-foreground")} />
                    <span className={cn("flex-1 text-sm", on && "font-semibold")}>
                      {m.value === "transferencia" ? "Transferencia" : m.label}
                    </span>
                    {m.value === "saldo" && (
                      <button
                        type="button"
                        onClick={() => setMontos((c) => ({ ...c, saldo: (Math.min(saldoDisponible, total) / 100).toFixed(2) }))}
                        className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
                      >
                        de {formatMXN(saldoDisponible)}
                      </button>
                    )}
                    {/* The remainder, one tap: the usual split is "this much
                        cash, the rest by transfer". */}
                    {!on && restante > 0 && (
                      <button
                        type="button"
                        onClick={() => setMontos((c) => ({ ...c, [m.value]: (restante / 100).toFixed(2) }))}
                        className="cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline"
                      >
                        resto
                      </button>
                    )}
                    <input
                      value={v}
                      onChange={(e) => setMontos((c) => ({ ...c, [m.value]: e.target.value.replace(/[^\d.,]/g, "") }))}
                      inputMode="decimal"
                      placeholder="0.00"
                      className="h-10 w-28 rounded-lg border border-border bg-background px-3 text-right text-base tabular-nums outline-hidden focus:ring-2 focus:ring-ring/30 sm:text-sm"
                    />
                  </label>
                );
              })}
              <div
                className={cn(
                  "flex items-baseline justify-between rounded-xl border px-3.5 py-2.5",
                  restante === 0 && pagos.length
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "border-border",
                )}
              >
                <span className="text-sm font-semibold">{restante > 0 ? "Falta" : restante < 0 ? "Sobra" : "Cuadra"}</span>
                <span className="text-lg font-bold tabular-nums">{formatMXN(restante === 0 ? total : Math.abs(restante))}</span>
              </div>
              {saldoExcedido && (
                <p className="text-xs text-red-600 dark:text-red-400">El saldo del cliente es {formatMXN(saldoDisponible)}.</p>
              )}
            </div>
          )}

          {hayTransferencia && (
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
              <CuentaPicker cuentas={listaCuentas} value={cuentaId} onChange={setCuentaId} label="¿A qué cuenta llegó?" />
              {sinCuentas && <SinCuentasAviso />}
              <div className="space-y-2">
                <p className="text-sm font-semibold">
                  Referencia o captura{" "}
                  <span className="font-normal text-muted-foreground">· {comprobanteObligatorio ? "obligatorio" : "opcional"}</span>
                </p>
                <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Referencia / clave de rastreo" className="h-11 text-base sm:text-sm" />
                <AdjuntarImagen value={foto} onChange={setFoto} />
              </div>
              {!comprobanteObligatorio && !referencia.trim() && !foto && (
                <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Sin comprobante, la transferencia aparece como “falta comprobante” en el corte.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2.5 border-t border-border px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <Button variant="secondary" className="hidden h-12 flex-1 sm:inline-flex" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button className="h-13 flex-2 text-base sm:h-12" onClick={confirmar} loading={pending} disabled={!puedeCobrar}>
            <Check className="h-5 w-5" />
            Completar cobro
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
