"use client";

import Link from "next/link";
import { MapPin, ShieldCheck, Smartphone, Truck } from "lucide-react";
import { foto } from "@/lib/foto";
import { formatPrecio } from "@/lib/money";
import { puntosRecoger } from "@/lib/tienda-info";
import { useCart } from "./CartProvider";
import { useTiendaInfo } from "./TiendaInfoProvider";

const unaDe = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} o ${xs[xs.length - 1]}`;

/**
 * Desktop, per the approved design: the order stays beside the catalog — what
 * is in it and the way to pay — with the shop's promises under it. Wide
 * screens only (xl); below that the header cart button does the job.
 */
export function RielPedido() {
  const { items, count, subtotal, ready } = useCart();
  const tienda = useTiendaInfo();
  const sucursales = puntosRecoger(tienda).map((p) => p.nombre ?? "tienda");

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-background p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-foreground">Tu pedido</h2>
          {ready && count > 0 && (
            <span className="text-sm text-muted-foreground">
              {count} {count === 1 ? "pieza" : "piezas"}
            </span>
          )}
        </div>

        {!ready || items.length === 0 ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Está vacío. Agrega piezas y aquí verás el total.
          </p>
        ) : (
          <>
            <ul className="mt-2 max-h-80 divide-y divide-border overflow-y-auto">
              {items.map((i) => (
                <li key={i.id} className="flex items-center gap-2.5 py-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/50">
                    {i.imagen ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={foto(i.imagen, 128)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Smartphone className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">{i.nombre}</span>
                    <span className="text-xs text-muted-foreground">{i.qty} pza</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {formatPrecio(i.precio_cents * i.qty)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-baseline justify-between border-t border-border pt-2.5">
              <span className="text-sm text-muted-foreground">Subtotal</span>
              <span className="text-lg font-semibold tabular-nums text-foreground">{formatPrecio(subtotal)}</span>
            </div>
            <Link
              href="/tienda/checkout"
              className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-tienda-600 text-sm font-semibold text-white shadow-sm shadow-tienda-600/30 transition-colors hover:bg-tienda-700"
            >
              Continuar al pago
            </Link>
          </>
        )}
      </div>

      <ul className="space-y-2.5 rounded-2xl border border-border bg-background p-4 text-[13px] leading-relaxed text-muted-foreground">
        {sucursales.length > 0 && (
          <li className="flex items-start gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-tienda-600" />
            Recoge en {unaDe(sucursales)}. Puedes mandar tu Uber con el folio.
          </li>
        )}
        <li className="flex items-start gap-2">
          <Truck className="mt-0.5 h-4 w-4 shrink-0 text-tienda-600" />
          Envío a todo México{tienda.entregaDias ? ` en ${tienda.entregaDias}` : ""}.
        </li>
        {tienda.garantiaDias != null && (
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-tienda-600" />
            {tienda.garantiaDias} días de garantía por defecto de fábrica.
          </li>
        )}
      </ul>
    </div>
  );
}
