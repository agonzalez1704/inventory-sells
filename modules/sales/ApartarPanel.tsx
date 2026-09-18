"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/components/use-is-mobile";
import { CuentaPicker, useCuentas, SinCuentasAviso } from "@/components/ui/cuenta";
import { crearAdelanto } from "@/modules/adelantos/actions";
import { guardarComprobanteAdelanto } from "./comprobantes";

const METODOS: [PaymentMethod, string][] = [
  ["efectivo", "Efectivo"],
  ["tarjeta", "Tarjeta"],
  ["transferencia", "Transferencia"],
  ["otro", "Otro"],
];

export type LineaApartado = { productId: string; nombre: string; qty: number; unit: number };

/**
 * "Apartar" from the cart: the pieces are held (stock reserved) against a first
 * payment. An adelanto is one product, so the cart becomes one per line and
 * the payment fills them in order — the total collected is what was handed
 * over, whichever line it lands on.
 */
export function ApartarPanel({
  open,
  lineas,
  clienteInicial,
  onClose,
  onListo,
}: {
  open: boolean;
  lineas: LineaApartado[];
  clienteInicial: string;
  onClose: () => void;
  onListo: () => void;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [cliente, setCliente] = useState("");
  const [abono, setAbono] = useState("");
  const [metodo, setMetodo] = useState<PaymentMethod>("efectivo");
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const [referencia, setReferencia] = useState("");
  const cuentas = useCuentas();
  const sinCuentas = cuentas !== null && cuentas.length === 0;
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setCliente(clienteInicial);
    setAbono("");
    setMetodo("efectivo");
    setCuentaId(null);
    setReferencia("");
  }, [open, clienteInicial]);

  const total = lineas.reduce((s, l) => s + l.unit * l.qty, 0);
  const abonoCents = Math.round((Number(abono.replace(",", ".")) || 0) * 100);
  const faltaCuenta = abonoCents > 0 && metodo === "transferencia" && !cuentaId;
  const listo = cliente.trim().length >= 3 && abonoCents <= total && !faltaCuenta && lineas.length > 0;

  function guardar() {
    if (!listo) return;
    start(async () => {
      let resta = abonoCents;
      let hechos = 0;
      try {
        for (const l of lineas) {
          const precio = l.unit * l.qty;
          const parte = Math.min(resta, precio);
          resta -= parte;
          const { id } = await crearAdelanto({
            tipo: "apartado",
            productId: l.productId,
            descripcion: null,
            qty: l.qty,
            precio: precio / 100,
            cliente: cliente.trim(),
            abono: parte / 100,
            abonoMetodo: metodo,
          });
          hechos++;
          if (parte > 0 && metodo === "transferencia" && (referencia.trim() || cuentaId)) {
            const rc = await guardarComprobanteAdelanto(id, referencia.trim() || null, undefined, cuentaId);
            if (!rc.ok) toast.error(`Apartado ok, pero el comprobante no se guardó: ${rc.error}`);
          }
        }
      } catch (e) {
        // Lines already created stay created: say which, don't pretend none were.
        toast.error(
          `${hechos ? `Se apartaron ${hechos} de ${lineas.length}. ` : ""}${e instanceof Error ? e.message : "No se pudo apartar"}`,
        );
        if (hechos) router.refresh();
        return;
      }
      toast.success(`Apartado para ${cliente.trim()}${abonoCents ? ` · abonó ${formatMXN(abonoCents)}` : ""}`, {
        action: { label: "Ver apartados", onClick: () => router.push("/adelantos") },
      });
      onListo();
      router.refresh();
    });
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} swipeDirection={isMobile ? "down" : "right"} showSwipeHandle={isMobile}>
      <DrawerContent className="data-[swipe-direction=down]:top-16 data-[swipe-direction=down]:max-h-none data-[swipe-direction=right]:w-[min(440px,100vw)]">
        <div className="flex items-start justify-between px-4 pt-1 pb-3 sm:px-6 sm:pt-5">
          <div>
            <DrawerTitle className="text-lg font-semibold sm:text-xl">Apartar</DrawerTitle>
            <p className="text-sm text-muted-foreground">Las piezas se guardan hasta que liquide.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div data-base-ui-swipe-ignore className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">
          <ul className="divide-y divide-border rounded-xl border border-border">
            {lineas.map((l) => (
              <li key={l.productId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 truncate">
                  <b className="tabular-nums">{l.qty}×</b> {l.nombre}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{formatMXN(l.unit * l.qty)}</span>
              </li>
            ))}
            <li className="flex justify-between bg-muted/40 px-3 py-2.5 text-sm font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatMXN(total)}</span>
            </li>
          </ul>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">¿A nombre de quién?</span>
            <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nombre y teléfono" className="h-11 text-base sm:text-sm" />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              Abono de hoy <span className="font-normal text-muted-foreground">· puede ser $0</span>
            </span>
            <div className={cn("flex h-12 items-center gap-1 rounded-lg border px-3", abonoCents > total ? "border-red-400" : "border-border")}>
              <span className="text-muted-foreground">$</span>
              <input
                inputMode="decimal"
                value={abono}
                onChange={(e) => setAbono(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="0.00"
                className="w-full min-w-0 bg-transparent text-lg tabular-nums outline-hidden"
              />
            </div>
            {abonoCents > 0 && abonoCents <= total && (
              <span className="text-xs text-muted-foreground">Resta {formatMXN(total - abonoCents)} al recoger.</span>
            )}
          </label>

          {abonoCents > 0 && (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-semibold">¿Cómo pagó el abono?</legend>
              <div className="flex flex-wrap gap-2">
                {METODOS.map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={metodo === k}
                    onClick={() => setMetodo(k)}
                    className={cn(
                      "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm sm:h-10",
                      metodo === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                    )}
                  >
                    {metodo === k && <Check className="h-3.5 w-3.5" />}
                    {label}
                  </button>
                ))}
              </div>
              {metodo === "transferencia" && (
                <div className="space-y-2 pt-1">
                  <CuentaPicker cuentas={cuentas ?? []} value={cuentaId} onChange={setCuentaId} label="¿A qué cuenta llegó?" />
                  {sinCuentas && <SinCuentasAviso />}
                  <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Referencia (opcional)" className="h-11 text-base sm:text-sm" />
                </div>
              )}
            </fieldset>
          )}
        </div>

        <div className="flex gap-2.5 border-t border-border px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <Button variant="secondary" className="hidden h-12 flex-1 sm:inline-flex" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button className="h-12 flex-2 text-base sm:text-sm" onClick={guardar} loading={pending} disabled={!listo}>
            {abonoCents ? `Apartar con ${formatMXN(abonoCents)}` : "Apartar sin abono"}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
