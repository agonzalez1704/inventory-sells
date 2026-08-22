"use client";

import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMXN } from "@/lib/money";
import { Thumb, type SalesProduct } from "./SalesScreen";

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
  if (!p) return null;

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
        <div className="aspect-square overflow-hidden rounded-xl border border-border bg-background">
          <Thumb src={p.image_url} alt={p.name} />
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
    </Modal>
  );
}
