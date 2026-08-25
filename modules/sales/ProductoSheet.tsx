"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Expand } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMXN } from "@/lib/money";
import { foto } from "@/lib/foto";
import { cn } from "@/lib/utils";
import { Thumb, type SalesProduct } from "./SalesScreen";
import { galeriaProducto } from "@/modules/inventory/actions";

// Everything the register knows about a product, for the seller who is holding
// it and needs to answer a question at the counter. Reached by pressing and
// holding the card, so it must never be the only route to something: it is a
// shortcut to reading, not a step in making a sale.
export function ProductoSheet({
  p,
  verCostos,
  onClose,
  onAgregar,
}: {
  p: SalesProduct | null;
  verCostos: boolean;
  onClose: () => void;
  onAgregar: (p: SalesProduct) => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [vistas, setVistas] = useState<string[]>([]);
  const [sel, setSel] = useState(0);
  // The product changes while the sheet is open (tapping another card): a
  // stale fullscreen — or the previous part's gallery — must not survive it.
  useEffect(() => {
    setFullscreen(false);
    setSel(0);
    setVistas([]);
    if (!p?.id) return;
    let on = true;
    galeriaProducto(p.id)
      .then((v) => on && setVistas(v))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [p?.id]);
  if (!p) return null;

  // Main photo first, supplier views after; sel indexes into this.
  const imagenes = [p.image_url, ...vistas].filter(Boolean) as string[];
  const imagen = imagenes[sel] ?? p.image_url;

  const margen =
    verCostos && (p.cost_cents ?? 0) > 0 && p.price_cents > 0
      ? Math.round(((p.price_cents - (p.cost_cents ?? 0)) / (p.cost_cents ?? 1)) * 100)
      : null;

  const filas: [string, string | null][] = [
    ["SKU", p.sku],
    ["Marca", p.brand],
    ["Categoría", p.category],
    ["Tamaño", p.size],
    ["Precio", p.price_cents ? formatMXN(p.price_cents) : "Sin precio"],
    // Cost and margin answer to the same permiso the rest of the app uses.
    ...(verCostos
      ? ([
          ["Costo", p.cost_cents ? formatMXN(p.cost_cents) : "—"],
          ["Margen", margen === null ? "—" : `${margen}%`],
        ] as [string, string | null][])
      : []),
    ["Existencia", `${p.quantity}`],
  ];

  return (
    <Modal open onClose={onClose} title={p.name} className="max-w-2xl">
      {/* Two columns from sm up: the photo owns the left, the answers and the
          add button own the right — the seller reads part and price in one
          glance without scrolling past a giant image. On a phone the drawer is
          one column and the photo leads. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => imagen && setFullscreen(true)}
            aria-label="Ver la foto en pantalla completa"
            className={cn(
              "group relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-background",
              imagen && "cursor-zoom-in",
            )}
          >
            <Thumb src={imagen} alt={p.name} />
            {imagen && (
              <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg bg-background/80 text-foreground shadow-sm backdrop-blur-sm transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <Expand className="h-4 w-4" />
              </span>
            )}
          </button>
          {imagenes.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto">
              {imagenes.map((url, i) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setSel(i)}
                  aria-label={`Vista ${i + 1}`}
                  className={cn(
                    "h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-background",
                    i === sel ? "border-ring ring-1 ring-ring/40" : "border-border",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foto(url, 64)} alt="" className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col">
          {p.etiqueta && (
            <Badge tone="warning" className="mb-2 self-start">
              {p.etiqueta}
            </Badge>
          )}
          <dl className="divide-y divide-border rounded-xl border border-border">
            {filas
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="text-right font-mono text-sm tabular-nums">{v}</dd>
                </div>
              ))}
          </dl>

          {/* The click that opens this replaced the tap that added, so the
              sheet must offer adding back — anchored to the column's foot. */}
          <Button
            className="mt-4 w-full sm:mt-auto"
            disabled={p.quantity === 0}
            onClick={() => {
              onAgregar(p);
              onClose();
            }}
          >
            {p.quantity === 0 ? "Agotado" : "Agregar a la venta"}
          </Button>
        </div>
      </div>

      {/* Portal to body, not markup in place: on the phone this sheet is a
          vaul drawer, which is transformed — position:fixed inside a transform
          anchors to the transform, not the viewport, and the "fullscreen"
          would be a box trapped inside the drawer. */}
      {fullscreen && imagen &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4"
            onClick={() => setFullscreen(false)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              // The big optimizer variant, not the 256px thumb the sheet shows
              // — fullscreen exists to read the part's fine detail.
              src={foto(imagen, 828)}
              alt={p.name}
              className="max-h-full max-w-full object-contain"
            />
            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => setFullscreen(false)}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm"
            >
              <X className="h-5 w-5" />
            </button>
          </div>,
          document.body,
        )}
    </Modal>
  );
}
