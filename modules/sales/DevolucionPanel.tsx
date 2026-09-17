"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boxes, Camera, Check, Minus, Plus, X } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { foto as urlFoto } from "@/lib/foto";
import type { PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/components/use-is-mobile";
import { devolverItems } from "./actions";
import type { VentaLista } from "./VentasView";

const METODOS: [PaymentMethod, string][] = [
  ["efectivo", "Efectivo"],
  ["transferencia", "Transferencia"],
  ["tarjeta", "Tarjeta"],
  ["otro", "Otro"],
];

/**
 * "Devolución", nested over the sale panel (same anatomy as the stock
 * adjustment): how many of each piece come back, how the money goes back, why.
 */
export function DevolucionPanel({
  open,
  venta,
  onClose,
}: {
  open: boolean;
  venta: VentaLista;
  onClose: () => void;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [metodo, setMetodo] = useState<PaymentMethod>("efectivo");
  const [motivo, setMotivo] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    const unaLinea = venta.sale_items.filter((i) => i.product_id);
    setQty(unaLinea.length === 1 && unaLinea[0].qty === 1 ? { [unaLinea[0].product_id!]: 1 } : {});
    // A split or store-credit sale has no single method to refund with.
    setMetodo(
      venta.payment_method && venta.payment_method !== "mixto" && venta.payment_method !== "saldo"
        ? venta.payment_method
        : "efectivo",
    );
    setMotivo("");
  }, [open, venta]);

  const lineas = useMemo(() => venta.sale_items.filter((it) => it.product_id), [venta.sale_items]);
  const total = lineas.reduce((s, l) => s + l.unit_price_cents * (qty[l.product_id!] ?? 0), 0);
  const piezas = lineas.reduce((s, l) => s + (qty[l.product_id!] ?? 0), 0);

  function guardar() {
    const items = lineas.map((l) => ({ product_id: l.product_id!, qty: qty[l.product_id!] ?? 0 })).filter((i) => i.qty > 0);
    if (!items.length) return;
    start(async () => {
      try {
        await devolverItems(venta.id, items, metodo, motivo || null);
        toast.success(`Devolución registrada · ${formatMXN(total)}`);
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo registrar la devolución");
      }
    });
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} swipeDirection={isMobile ? "down" : "right"} showSwipeHandle={isMobile}>
      <DrawerContent
        overlay={false}
        className="data-[swipe-direction=down]:top-16 data-[swipe-direction=down]:max-h-none data-[swipe-direction=right]:w-[min(440px,100vw)]"
      >
        <div className="flex items-center justify-between px-4 py-2.5 sm:px-6 sm:pt-5">
          <DrawerTitle className="text-lg font-semibold sm:text-xl">Devolución</DrawerTitle>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div data-base-ui-swipe-ignore className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">
          <p className="text-sm text-muted-foreground">
            Venta de {formatMXN(venta.total_cents)}
            {venta.customer_name && venta.customer_name !== "Mostrador" && ` · ${venta.customer_name}`}
          </p>

          <div className="space-y-2">
            <p className="text-sm font-semibold">¿Qué regresa?</p>
            {lineas.map((l) => {
              const n = qty[l.product_id!] ?? 0;
              const set = (v: number) => setQty((q) => ({ ...q, [l.product_id!]: Math.max(0, Math.min(v, l.qty)) }));
              return (
                <div key={l.product_id} className={cn("flex items-center gap-3 rounded-xl border p-2.5", n ? "border-foreground" : "border-border")}>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                    {l.products?.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={urlFoto(l.products.image_url, 128)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Camera className="h-4 w-4 text-muted-foreground/60" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{l.products?.name ?? "Producto"}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      Vendidas {l.qty} · {formatMXN(l.unit_price_cents)} c/u
                    </p>
                  </div>
                  <div className="flex h-10 items-center overflow-hidden rounded-lg border border-border">
                    <button type="button" aria-label="Una menos" disabled={!n} onClick={() => set(n - 1)} className="flex h-full w-9 cursor-pointer items-center justify-center hover:bg-muted disabled:opacity-30">
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-7 text-center text-base font-semibold tabular-nums">{n}</span>
                    <button type="button" aria-label="Una más" disabled={n >= l.qty} onClick={() => set(n + 1)} className="flex h-full w-9 cursor-pointer items-center justify-center hover:bg-muted disabled:opacity-30">
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">¿Cómo le regresas el dinero?</legend>
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
            <p className="text-xs text-muted-foreground">
              {metodo === "efectivo" ? "Sale del cajón de hoy: el cuadre lo cuenta como salida." : "Cuenta como devolución de hoy en el corte."}
            </p>
          </fieldset>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              Motivo <span className="font-normal text-muted-foreground">· opcional</span>
            </span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Ej. no era el modelo, la pantalla no encendió"
              className="w-full resize-none rounded-xl border border-border bg-background p-3 text-base outline-hidden focus:ring-2 focus:ring-ring/30 sm:text-sm"
            />
          </label>

          {piezas > 0 && (
            <p className="flex items-center gap-2 rounded-xl bg-muted/50 px-3.5 py-2.5 text-sm">
              <Boxes className="h-4 w-4 text-emerald-600" />
              {piezas} {piezas === 1 ? "pieza regresa" : "piezas regresan"} a su inventario
            </p>
          )}
        </div>

        <div className="flex gap-2.5 border-t border-border px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
          <Button variant="secondary" className="hidden h-12 flex-1 sm:inline-flex" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="danger" className="h-12 flex-2 text-base sm:text-sm" onClick={guardar} loading={pending} disabled={!piezas}>
            {piezas ? `Devolver ${formatMXN(total)}` : "Elige qué regresa"}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
