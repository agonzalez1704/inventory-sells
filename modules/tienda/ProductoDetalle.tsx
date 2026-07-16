import Link from "next/link";
import {
  ArrowLeft,
  Smartphone,
  ShieldCheck,
  Truck,
  MessageCircle,
} from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { calidadDe, marcoDe, CALIDAD_LABEL } from "@/lib/calidad";
import { TIENDA } from "@/lib/tienda-info";
import { AddToCart } from "./AddToCart";

export type DetalleProducto = {
  id: string;
  nombre: string;
  marca: string | null;
  categoria: string | null;
  talla: string | null;
  color: string | null;
  precio_cents: number;
  disponible: boolean;
  imagen: string | null;
};
export type RelacionadoProducto = {
  id: string;
  nombre: string;
  marca: string | null;
  precio_cents: number;
  disponible: boolean;
  imagen: string | null;
};

// Quality/frame are derived from the product name — see lib/calidad.ts.
function calidadLabel(n: string): string | null {
  const c = calidadDe(n);
  return c ? CALIDAD_LABEL[c] : null;
}

function waHref(nombre: string, whatsapp: string | null) {
  const text = encodeURIComponent(`Hola Lead Displays, me interesa: ${nombre}`);
  return whatsapp
    ? `https://wa.me/${whatsapp}?text=${text}`
    : `https://wa.me/?text=${text}`;
}

export function ProductoDetalle({
  producto: p,
  relacionados,
  whatsapp,
}: {
  producto: DetalleProducto;
  relacionados: RelacionadoProducto[];
  whatsapp: string | null;
}) {
  const specs = [
    ["Marca", p.marca],
    ["Categoría", p.categoria],
    ["Calidad", calidadLabel(p.nombre)],
    ["Marco", marcoDe(p.nombre)],
    ["Color", p.color],
    ["Tamaño", p.talla],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href="/tienda"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-blue-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Catálogo
      </Link>

      <div className="mt-5 grid gap-8 md:grid-cols-2">
        {/* Image */}
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-3xl border border-blue-100 bg-white">
          {p.imagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.imagen}
              alt={p.nombre}
              className="h-full w-full object-contain p-4"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 to-slate-50 text-blue-300">
              <Smartphone className="h-24 w-24" />
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          {p.categoria && (
            <span className="text-xs font-medium uppercase tracking-wide text-blue-600">
              {p.categoria}
            </span>
          )}
          <h1 className="mt-1 text-balance text-2xl font-semibold leading-tight tracking-tight text-slate-900 [font-family:var(--font-display)] sm:text-3xl">
            {p.nombre}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-3xl font-semibold tabular-nums text-blue-800 [font-family:var(--font-display)]">
              {p.precio_cents > 0 ? formatMXN(p.precio_cents) : "A cotizar"}
            </span>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium",
                p.disponible
                  ? "bg-green-100 text-green-700"
                  : "bg-slate-100 text-slate-500",
              )}
            >
              {p.disponible ? "Disponible" : "Agotado"}
            </span>
          </div>

          {/* Specs */}
          {specs.length > 0 && (
            <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-slate-200 bg-white p-4">
              {specs.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd className="text-sm font-medium text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* CTA — buy online, or ask if you'd rather talk to someone */}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            {p.precio_cents > 0 && (
              <AddToCart
                size="lg"
                className="sm:flex-1"
                p={{
                  id: p.id,
                  nombre: p.nombre,
                  precio_cents: p.precio_cents,
                  imagen: p.imagen,
                  disponible: p.disponible,
                }}
              />
            )}
            <a
              href={waHref(p.nombre, whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-5 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100 sm:flex-1"
            >
              <MessageCircle className="h-5 w-5" />
              Preguntar por WhatsApp
            </a>
          </div>

          <div className="mt-5 space-y-2 text-xs text-slate-500">
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
              <span>
                <strong className="text-slate-700">
                  {TIENDA.garantiaDias} días de garantía
                </strong>{" "}
                por defecto de fábrica, {TIENDA.garantiaCondicion}.
              </span>
            </p>
            <p className="flex items-start gap-2">
              <Truck className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
              <span>
                Envíos a todo México · entrega en{" "}
                <strong className="text-slate-700">
                  {TIENDA.entregaDias} hábiles
                </strong>
                . El costo de envío se calcula según tu destino. Precio sujeto a
                disponibilidad.
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Related */}
      {relacionados.length > 0 && (
        <section className="mt-14">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 [font-family:var(--font-display)]">
            También te puede interesar
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {relacionados.map((r) => (
              <Link
                key={r.id}
                href={`/tienda/${r.id}`}
                className={cn(
                  "group flex flex-col rounded-2xl border border-slate-200 bg-white p-3 transition-all hover:border-blue-300 hover:shadow-lg hover:shadow-blue-900/5",
                  !r.disponible && "opacity-75",
                )}
              >
                <div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-white">
                  {r.imagen ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.imagen}
                      alt={r.nombre}
                      loading="lazy"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 to-slate-50 text-blue-400 transition-colors group-hover:text-blue-500">
                      <Smartphone className="h-8 w-8" />
                    </div>
                  )}
                </div>
                <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-tight text-slate-900">
                  {r.nombre}
                </p>
                <span className="mt-1 font-semibold tabular-nums text-blue-800 [font-family:var(--font-display)]">
                  {r.precio_cents > 0 ? formatMXN(r.precio_cents) : "A cotizar"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
