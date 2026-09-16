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
  whatsapp: string | null;
}) {
  return (
    // Bottom padding: room for the fixed buy bar on phones.
    <div className="mx-auto max-w-6xl px-4 pb-32 pt-1 sm:px-6 lg:pb-12 lg:pt-6 xl:max-w-7xl">
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_280px] xl:gap-8">
        <div className="min-w-0">
          <ModeloCompra modelo={modelo} inicial={inicial} vistas={vistas} whatsapp={whatsapp} />
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
            <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-tight text-foreground">{r.nombre}</p>
            <span className="mt-1 font-semibold tabular-nums text-foreground">
              {r.precio_cents > 0 ? formatPrecio(r.precio_cents) : "A cotizar"}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
