"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight, MapPin, MessageCircle, ShieldCheck, Truck } from "lucide-react";
import { foto } from "@/lib/foto";
import { StepperPieza } from "./StepperPieza";
import { formatPrecio } from "@/lib/money";
import { cn } from "@/lib/utils";
import { glosaDe, type ModeloTienda, type VarianteModelo } from "@/lib/calidades";
import { marcoDe } from "@/lib/calidad";
import { MARCA } from "@/lib/marca";
import { puntosRecoger } from "@/lib/tienda-info";
import { useTiendaInfo } from "./TiendaInfoProvider";
import { useCart } from "./CartProvider";
import { MAX_POR_PRODUCTO } from "./AddToCart";
import { GaleriaFotos } from "./GaleriaFotos";

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// "Centro, Panorama y Norte" — with "o": the customer picks one.
const unaDe = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} o ${xs[xs.length - 1]}`;

/** Never a count: the storefront publishes no stock numbers. */
function estado(v: VarianteModelo): { texto: string; tono: string } | null {
  if (!v.disponible) return { texto: "Agotada", tono: "text-muted-foreground" };
  if (v.ultima) return { texto: "Última pieza", tono: "text-amber-700" };
  if ((v.entrega_dias ?? 0) > 0) return { texto: `Llega en +${v.entrega_dias} días hábiles`, tono: "text-amber-700" };
  return null;
}

/**
 * Choose the quality, see it, buy it. One variant = no selector, just the price.
 * Selecting swaps the URL in place (no navigation), so a shared link opens the
 * quality the customer was looking at.
 */
export function ModeloCompra({
  modelo: m,
  inicial,
  vistas,
  whatsapp,
}: {
  modelo: ModeloTienda;
  inicial: string;
  vistas: Record<string, string[]>;
  whatsapp: string | null;
}) {
  const router = useRouter();
  const tienda = useTiendaInfo();
  const { add, items } = useCart();
  const [selId, setSelId] = useState(inicial);
  // Desktop only: phones add one at a time from the fixed bar, per the design.
  const [cantidad, setCantidad] = useState(1);

  const v = m.variantes.find((x) => x.id === selId) ?? m.variantes[0];
  const varias = m.variantes.length > 1;
  const tope = (items.find((i) => i.id === v.id)?.qty ?? 0) >= MAX_POR_PRODUCTO;
  const sucursales = puntosRecoger(tienda).map((p) => p.nombre ?? "tienda");
  const local = v.disponible && !(v.entrega_dias ?? 0);
  // `||`, not `??`: a variant with no photo of its own carries "" as often as
  // null, and either way the model's photo is the same part.
  const imagenes = [...new Set([v.imagen || m.imagen, ...(vistas[v.id] ?? [])].filter(Boolean) as string[])];
  const wa = `https://wa.me/${whatsapp ?? ""}?text=${encodeURIComponent(
    `Hola ${MARCA.tienda.nombre}, me interesa: ${v.nombre}`,
  )}`;

  function elegir(id: string) {
    setSelId(id);
    window.history.replaceState(null, "", `/tienda/${id}`);
  }

  const principal =
    "flex h-14 min-w-0 flex-1 items-center justify-between gap-3 rounded-2xl px-5 text-base font-semibold";

  return (
    <>
      {/* Back keeps the search and filters the customer came from; a direct
          link with no history goes to the catalog. */}
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? router.back() : router.push("/tienda"))}
        className="inline-flex h-11 cursor-pointer items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-tienda-700 lg:hidden"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver
      </button>

      {/* Desktop: where this sits in the catalog, each step a way back into it. */}
      <nav aria-label="Ubicación" className="mb-4 hidden h-11 items-center gap-1.5 text-sm text-muted-foreground lg:flex">
        <Link href="/tienda" className="hover:text-tienda-700 hover:underline">
          Catálogo
        </Link>
        {m.category && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href={`/tienda?cat=${encodeURIComponent(m.category)}`} className="hover:text-tienda-700 hover:underline">
              {cap(m.category)}
            </Link>
          </>
        )}
        {m.brand && (
          <>
            <ChevronRight className="h-3.5 w-3.5" />
            <Link href={`/tienda?marca=${encodeURIComponent(m.brand)}`} className="hover:text-tienda-700 hover:underline">
              {m.brand}
            </Link>
          </>
        )}
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="truncate font-medium text-foreground">{m.modelo}</span>
      </nav>

      <div className="lg:grid lg:grid-cols-2 lg:gap-10">
        <div className="-mx-4 sm:mx-0">
          <GaleriaFotos key={v.id} imagenes={imagenes} alt={v.nombre} />
          {/* Desktop: one thumbnail per quality — seeing the part is a way to
              choose it. Only when the qualities actually have their own photos. */}
          {varias && m.variantes.some((x) => x.imagen) && (
            <div className="mt-3 hidden gap-2 lg:flex">
              {m.variantes.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => elegir(x.id)}
                  aria-label={`Ver ${x.calidad ?? x.nombre}`}
                  className={cn(
                    "flex w-20 cursor-pointer flex-col items-center gap-1 rounded-xl p-1 text-xs transition-colors",
                    x.id === v.id ? "ring-2 ring-tienda-600" : "ring-1 ring-border hover:ring-tienda-300",
                  )}
                >
                  <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-muted/50">
                    {x.imagen || m.imagen ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={foto((x.imagen || m.imagen) as string, 128)} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </span>
                  <span className="w-full truncate text-center text-muted-foreground">{x.calidad ?? x.nombre}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pt-4 lg:pt-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {[m.brand, m.category && cap(m.category)].filter(Boolean).join(" · ")}
          </p>
          <h1 className="mt-0.5 text-balance text-[22px] font-semibold leading-tight tracking-tight text-foreground lg:text-3xl">
            {m.modelo}
          </h1>
          {!varias && v.nombre.toUpperCase() !== m.modelo.toUpperCase() && (
            <p className="mt-1 text-sm text-muted-foreground">{v.nombre}</p>
          )}

          {varias ? (
            <>
              {/* Only a shop whose variants ARE quality tiers says "calidad". */}
              <h2 className="mt-4 text-[15px] font-semibold text-foreground">
                {m.variantes.some((x) => x.calidad) ? "Elige la calidad" : "Elige la opción"}
              </h2>
              <div role="radiogroup" aria-label="Calidad" className="mt-2 flex flex-col gap-2">
                {m.variantes.map((x) => {
                  const on = x.id === v.id;
                  const e = estado(x);
                  const detalle = [glosaDe(x.calidad), marcoDe(x.nombre)].filter(Boolean).join(" · ");
                  return (
                    <button
                      key={x.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => elegir(x.id)}
                      className={cn(
                        "flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors",
                        on
                          ? "bg-tienda-50/70 ring-2 ring-tienda-600"
                          : "bg-background ring-1 ring-border hover:ring-tienda-300",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "h-5 w-5 shrink-0 rounded-full bg-white",
                          on ? "border-[6px] border-tienda-600" : "border-[1.5px] border-muted-foreground/40",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[15px] font-semibold text-foreground">
                          {x.calidad ?? x.nombre}
                          {m.mas_vendida === x.id && (
                            <span className="rounded-md bg-tienda-100 px-1.5 py-0.5 text-xs font-medium text-tienda-800">
                              La más pedida
                            </span>
                          )}
                        </span>
                        {(detalle || e) && (
                          <span className="block text-[13px] text-muted-foreground">
                            {detalle}
                            {detalle && e ? " · " : ""}
                            {e && <span className={e.tono}>{e.texto}</span>}
                          </span>
                        )}
                      </span>
                      <span className={cn("shrink-0 text-[17px] font-semibold tabular-nums", !x.disponible && "text-muted-foreground")}>
                        {x.precio_cents > 0 ? formatPrecio(x.precio_cents) : "A cotizar"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3">
              <span className="text-3xl font-semibold tabular-nums text-foreground">
                {v.precio_cents > 0 ? formatPrecio(v.precio_cents) : "A cotizar"}
              </span>
              {(() => {
                const e = estado(v);
                return e ? <span className={cn("text-sm font-medium", e.tono)}>{e.texto}</span> : null;
              })()}
            </div>
          )}

          <ul className="mt-5 space-y-2.5 text-sm text-muted-foreground">
            {local && sucursales.length > 0 && (
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-tienda-600" />
                Recógela en {unaDe(sucursales)}
              </li>
            )}
            <li className="flex items-start gap-2.5">
              <Truck className="mt-0.5 h-4 w-4 shrink-0 text-tienda-600" />
              Envío a todo México{tienda.entregaDias ? ` en ${tienda.entregaDias}` : ""}. El costo se calcula con tu código postal.
            </li>
            {tienda.garantiaDias != null && (
              <li className="flex items-start gap-2.5">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-tienda-600" />
                {tienda.garantiaDias} días de garantía por defecto de fábrica
                {tienda.garantiaCondicion ? `, ${tienda.garantiaCondicion}` : ""}
              </li>
            )}
          </ul>

          {/* Phone: fixed to the bottom, where the thumb is. Desktop: inline. */}
          <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2.5 border-t border-border bg-background px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:static lg:mt-6 lg:border-0 lg:bg-transparent lg:p-0">
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Preguntar por WhatsApp"
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-background text-green-600 transition-colors hover:bg-green-50"
            >
              <MessageCircle className="h-6 w-6" />
            </a>
            {v.precio_cents > 0 && v.disponible && !tope && (
              <div className="hidden lg:block">
                <StepperPieza
                  qty={cantidad}
                  max={MAX_POR_PRODUCTO}
                  nombre={v.nombre}
                  minimo={1}
                  onChange={(n) => setCantidad(Math.max(1, Math.min(MAX_POR_PRODUCTO, n)))}
                />
              </div>
            )}
            {v.precio_cents <= 0 ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(principal, "justify-center bg-green-600 text-white")}>
                Preguntar precio
              </a>
            ) : !v.disponible ? (
              <button type="button" disabled className={cn(principal, "justify-center bg-muted text-muted-foreground")}>
                Agotada
              </button>
            ) : tope ? (
              <button type="button" disabled className={cn(principal, "justify-center bg-muted text-muted-foreground")}>
                Máximo por pieza en línea
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  add(
                    {
                      id: v.id,
                      nombre: v.nombre,
                      precio_cents: v.precio_cents,
                      imagen: v.imagen ?? m.imagen,
                      max: MAX_POR_PRODUCTO,
                    },
                    cantidad,
                  )
                }
                className={cn(principal, "cursor-pointer bg-tienda-600 text-white shadow-sm shadow-tienda-600/30 hover:bg-tienda-700")}
              >
                <span className="truncate">{v.calidad ? `Agregar ${v.calidad}` : "Agregar al pedido"}</span>
                <span className="shrink-0 tabular-nums">{formatPrecio(v.precio_cents)}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
