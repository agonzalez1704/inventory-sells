"use client";

import { useMemo, useState } from "react";
import { Boxes, PackageSearch, Upload, Search } from "lucide-react";
import type { Product } from "@/lib/types";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { ImportPanel } from "./import/ImportPanel";

export type InventoryRow = Pick<
  Product,
  "id" | "sku" | "name" | "category" | "brand" | "size" | "price_cents" | "quantity"
>;

function StockCell({ qty }: { qty: number }) {
  if (qty === 0) return <Badge tone="danger">Agotado</Badge>;
  if (qty <= 5) return <Badge tone="warning">{qty} bajo</Badge>;
  return <span className="tabular-nums text-foreground">{qty}</span>;
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
    </Card>
  );
}

export function InventoryView({
  products,
  isAdmin,
}: {
  products: InventoryRow[];
  isAdmin: boolean;
}) {
  const [query, setQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const stats = useMemo(() => {
    const units = products.reduce((s, p) => s + p.quantity, 0);
    const value = products.reduce((s, p) => s + p.price_cents * p.quantity, 0);
    const low = products.filter((p) => p.quantity > 0 && p.quantity <= 5).length;
    const out = products.filter((p) => p.quantity === 0).length;
    return { units, value, low, out };
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q),
    );
  }, [query, products]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {products.length} productos · {stats.units} unidades
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            Importar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Productos" value={String(products.length)} />
        <Kpi label="Unidades" value={String(stats.units)} />
        <Kpi label="Valor (venta)" value={formatMXN(stats.value)} />
        <Kpi label="Bajo / agotado" value={`${stats.low} / ${stats.out}`} />
      </div>

      <Card>
        <div className="border-b border-border p-3">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por SKU, nombre o categoría…"
              className="pl-9"
            />
          </div>
        </div>

        {products.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Boxes}
              title="Sin productos"
              description={
                isAdmin
                  ? "Importa una foto o un Excel para cargar tu catálogo."
                  : "Pide a un administrador que cargue inventario."
              }
              action={
                isAdmin ? (
                  <Button onClick={() => setImportOpen(true)}>
                    <Upload className="h-4 w-4" />
                    Importar inventario
                  </Button>
                ) : undefined
              }
              className="border-0"
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={PackageSearch}
              title="Sin resultados"
              description={`Nada coincide con “${query}”.`}
              className="border-0"
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">SKU</th>
                  <th className="px-4 py-2.5 font-medium">Producto</th>
                  <th className="px-4 py-2.5 font-medium">Categoría</th>
                  <th className="px-4 py-2.5 text-right font-medium">Precio</th>
                  <th className="px-4 py-2.5 text-right font-medium">Stock</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                      {p.sku}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{p.name}</span>
                      {(p.brand || p.size) && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {[p.brand, p.size].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {p.category ? (
                        <Badge tone="neutral">{p.category}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {formatMXN(p.price_cents)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <StockCell qty={p.quantity} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Importar inventario"
      >
        <ImportPanel onClose={() => setImportOpen(false)} />
      </Modal>
    </section>
  );
}
