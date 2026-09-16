"use client";

import Link from "next/link";
import { Drawer as Vaul } from "vaul";
import { ShoppingCart, Smartphone, X } from "lucide-react";
import { foto } from "@/lib/foto";
import { formatPrecio } from "@/lib/money";
import { puntosRecoger } from "@/lib/tienda-info";
import { useIsMobile } from "@/components/use-is-mobile";
import { cn } from "@/lib/utils";
import { useCart } from "./CartProvider";
import { useTiendaInfo } from "./TiendaInfoProvider";
import { EntregaSelector, entregaEfectiva } from "./EntregaSelector";
import { StepperPieza } from "./StepperPieza";
import { etiquetaApartado } from "./apartado";
import { usePreviewApartado } from "./usePreviewApartado";

// Cart button + drawer. Bottom sheet on phones, side panel on desktop.
export function CartButton() {
  const { count, open, setOpen, ready } = useCart();
  const isMobile = useIsMobile();

  return (
    <Vaul.Root open={open} onOpenChange={setOpen} direction={isMobile ? "bottom" : "right"}>
      <Vaul.Trigger asChild>
        <button
          aria-label={`Carrito${count ? ` (${count})` : ""}`}
          className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-tienda-100 bg-background text-foreground transition-colors hover:border-tienda-300 hover:text-tienda-700 dark:border-tienda-900 dark:text-tienda-300"
        >
          <ShoppingCart className="h-5 w-5" />
          {ready && count > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-tienda-600 px-1 text-[11px] font-semibold text-white">
              {count}
            </span>
          )}
        </button>
      </Vaul.Trigger>

      <Vaul.Portal>
        <Vaul.Overlay className="fixed inset-0 z-50 bg-slate-900/45" />
        <Vaul.Content
          className={cn(
            "fixed z-50 flex flex-col bg-background outline-none",
            isMobile
              ? "inset-x-0 bottom-0 top-10 rounded-t-[20px]"
              : "bottom-0 right-0 top-0 w-full max-w-md",
          )}
        >
          <CartBody mobile={isMobile} />
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  );
}

/**
 * "Tu pedido" — the approved design: the pieces with real steppers, then how
 * the order is received, then the total and a button that says exactly what
 * happens next ("Apartar por 2 horas" when the customer comes in person).
 */
function CartBody({ mobile }: { mobile: boolean }) {
  const { items, subtotal, setQty, count, setOpen, open, entrega, setEntrega } = useCart();
  const tienda = useTiendaInfo();
  const puntos = puntosRecoger(tienda);
  const { horas, motivo } = usePreviewApartado(items, open && items.length > 0);
  const e = entregaEfectiva(entrega, puntos, !motivo);
  const apartar = e.tipo === "recoger" && e.quien === "yo";
  const etiqueta = horas != null ? etiquetaApartado(horas) : null;

  return (
    <>
      {mobile && <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-muted" />}

      <div className="flex items-center justify-between py-1.5 pl-4 pr-2">
        <div className="flex items-baseline gap-2">
          <Vaul.Title className="text-lg font-semibold tracking-tight text-foreground">Tu pedido</Vaul.Title>
          {count > 0 && (
            <span className="text-sm text-muted-foreground">
              {count} {count === 1 ? "pieza" : "piezas"}
            </span>
          )}
        </div>
        <Vaul.Close asChild>
          <button
            type="button"
            aria-label="Cerrar"
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </Vaul.Close>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
          <ShoppingCart className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Tu pedido está vacío</p>
          <p className="text-xs text-muted-foreground">Agrega piezas desde el catálogo.</p>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4">
            <ul className="divide-y divide-border">
              {items.map((i) => (
                <li key={i.id} className="flex gap-3 py-3">
                  <span className="flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-muted/50">
                    {i.imagen ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={foto(i.imagen, 128)} alt={i.nombre} className="h-full w-full object-cover" />
                    ) : (
                      <Smartphone className="h-6 w-6 text-muted-foreground/40" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">{i.nombre}</p>
                      <span className="shrink-0 text-[15px] font-semibold tabular-nums text-foreground">
                        {formatPrecio(i.precio_cents * i.qty)}
                      </span>
                    </div>
                    <div className="mt-2">
                      <StepperPieza qty={i.qty} max={i.max} nombre={i.nombre} onChange={(q) => setQty(i.id, q)} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="pb-4 pt-3">
              <h3 className="mb-2 text-[15px] font-semibold text-foreground">¿Cómo lo recibes?</h3>
              <EntregaSelector
                entrega={e}
                onChange={setEntrega}
                puntos={puntos}
                horas={horas}
                motivoNoApartar={motivo}
                entregaDias={tienda.entregaDias}
              />
            </div>
          </div>

          <div className="border-t border-border px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] text-muted-foreground">{e.tipo === "envio" ? "Subtotal" : "Total"}</span>
              <span className="text-[22px] font-semibold tabular-nums text-foreground">{formatPrecio(subtotal)}</span>
            </div>
            <Link
              href="/tienda/checkout"
              onClick={() => setOpen(false)}
              className="mt-3 flex h-14 w-full items-center justify-center rounded-2xl bg-tienda-600 text-base font-semibold text-white shadow-sm shadow-tienda-600/30 transition-colors hover:bg-tienda-700"
            >
              {apartar ? (etiqueta?.cta ?? "Apartar mis piezas") : "Continuar al pago"}
            </Link>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {apartar
                ? (etiqueta?.nota ?? "Pagas al recoger")
                : e.tipo === "envio"
                  ? "El envío se calcula con tu código postal"
                  : "Quien recoge solo da el folio: el pedido va pagado"}
            </p>
          </div>
        </>
      )}
    </>
  );
}

/** Phone: the order stays one thumb away on every catalog screen. Opens the
 *  same drawer the header button does. */
export function BarraPedido() {
  const { count, subtotal, setOpen, ready } = useCart();
  if (!ready || count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-14 w-full cursor-pointer items-center justify-between rounded-2xl bg-tienda-600 px-5 text-white shadow-sm shadow-tienda-600/30"
      >
        <span className="text-[15px] font-semibold">Ver pedido</span>
        <span className="flex items-center gap-2.5 text-sm">
          {count} {count === 1 ? "pieza" : "piezas"}
          <span className="text-base font-semibold tabular-nums">{formatPrecio(subtotal)}</span>
        </span>
      </button>
    </div>
  );
}
