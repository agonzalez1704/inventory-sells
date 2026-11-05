import Link from "next/link";
import { Smartphone } from "lucide-react";
import { foto } from "@/lib/foto";
import { formatPrecio } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ModeloTienda } from "@/lib/calidades";
import { ModeloCompra } from "./ModeloCompra";
import { RielPedido } from "./RielPedido";

export type RelacionadoProducto = {
  id: string;
  nombre: string;
  marca: string | null;
  precio_cents: number;
  disponible: boolean;
  imagen: string | null;
};

export function ProductoDetalle({
  modelo,
  inicial,
  vistas,
  relacionados,
  compatibles = [],
  conversiones = [],
  otrasMarcas = [],
  carros = [],
  descripcion,
  whatsapp,
}: {
  modelo: ModeloTienda;
  /** The variant the URL named: preselected. */
  inicial: string;
  /** Extra photos per variant id. */
  vistas: Record<string, string[]>;
  relacionados: RelacionadoProducto[];
  /** Products sharing a compatibility tag — the strongest recommendation. */
  compatibles?: RelacionadoProducto[];
  /** Equivalent parts the shop carries. */
  conversiones?: (RelacionadoProducto & { sku: string })[];
  /** Other brands' numbers for this part, not carried. */
  otrasMarcas?: string[];
  /** The cars it fits: "Nissan Versa V-Drive 2012–2025 1.6L". */
  carros?: string[];
  descripcion?: string | null;
  whatsapp: string | null;
}) {
  return (
    // Bottom padding: room for the fixed buy bar on phones.
    <div className="mx-auto max-w-6xl px-4 pb-32 pt-1 sm:px-6 lg:pb-12 lg:pt-6 xl:max-w-7xl">
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_280px] xl:gap-8">
        <div className="min-w-0">
          <ModeloCompra modelo={modelo} inicial={inicial} vistas={vistas} whatsapp={whatsapp} />
          {/* Desktop: two columns on the same grid as photo | options above, so
              "Le queda a" and the conversions sit side by side instead of a
              half-width stack with an empty column next to it. */}
          <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-10">
            {descripcion && (
              <section className="mt-8 max-w-prose lg:col-span-2">
                <h2 className="text-base font-semibold tracking-tight text-foreground">Descripción</h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{descripcion}</p>
              </section>
            )}
            {carros.length > 0 && <LeQueda carros={carros} />}
            {(conversiones.length > 0 || otrasMarcas.length > 0) && (
              <Conversiones items={conversiones} otrasMarcas={otrasMarcas} />
            )}
          </div>
        </div>
        <aside className="hidden xl:sticky xl:top-20 xl:block xl:self-start">
          <RielPedido />
        </aside>
      </div>

      {/* Compatible parts come first: they answer "does this fit MY car",
          which outranks a same-category browse. */}
      {compatibles.length > 0 && <RejaMini titulo="Compatibles con esta pieza" items={compatibles} />}
      {relacionados.length > 0 && <RejaMini titulo="También buscan" items={relacionados} />}
    </div>
  );
}

function LeQueda({ carros }: { carros: string[] }) {
  return (
    <section className="mt-8 max-w-prose lg:max-w-none">
      <h2 className="text-base font-semibold tracking-tight text-foreground">Le queda a</h2>
      <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background">
        {carros.map((c) => (
          <li key={c} className="px-3 py-2.5 text-sm text-foreground">{c}</li>
        ))}
      </ul>
    </section>
  );
}

function Conversiones({
  items,
  otrasMarcas,
}: {
  items: (RelacionadoProducto & { sku: string })[];
  otrasMarcas: string[];
}) {
  return (
    <section className="mt-8 max-w-prose lg:max-w-none">
      <h2 className="text-base font-semibold tracking-tight text-foreground">Conversiones</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Piezas equivalentes que te sirven igual.</p>
      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background">
          {items.map((c) => (
            <li key={c.id}>
              <Link
                href={`/tienda/${c.id}`}
                className="flex items-center gap-3 px-3 py-2.5 transition-colors duration-150 ease-out hover:bg-muted/60 active:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-semibold text-foreground">{c.sku}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[c.nombre, c.marca].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {c.precio_cents > 0 ? formatPrecio(c.precio_cents) : "A cotizar"}
                  </p>
                  <p
                    className={cn(
                      "text-xs font-medium",
                      c.disponible ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
                    )}
                  >
                    {c.disponible ? "Disponible" : "Agotada"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {otrasMarcas.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground">También equivale a</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {otrasMarcas.map((n) => (
              <span
                key={n}
                className="rounded-lg border border-border bg-muted px-2 py-0.5 font-mono text-xs font-semibold text-foreground"
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function RejaMini({ titulo, items }: { titulo: string; items: RelacionadoProducto[] }) {
  return (
    <section className="mt-10">
      <h2 className="text-base font-semibold tracking-tight text-foreground">{titulo}</h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((r) => (
          <Link
            key={r.id}
            href={`/tienda/${r.id}`}
            className={cn(
              "group flex flex-col rounded-2xl border border-border bg-background p-3 transition-colors hover:border-tienda-300",
              !r.disponible && "opacity-75",
            )}
          >
            <div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-muted/40">
              {r.imagen ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={foto(r.imagen, 256)} alt={r.nombre} loading="lazy" className="h-full w-full object-contain" />
              ) : (
                <Smartphone className="h-8 w-8 text-muted-foreground/40" />
              )}
            </div>
            <p className="line-clamp-2 min-h-10 text-sm font-medium leading-tight text-foreground">{r.nombre}</p>
            <span className="mt-1 font-semibold tabular-nums text-foreground">
              {r.precio_cents > 0 ? formatPrecio(r.precio_cents) : "A cotizar"}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
