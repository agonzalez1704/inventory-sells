"use client";

import { useMemo, useState } from "react";
import {
  Boxes,
  PackageSearch,
  Upload,
  Search,
  FileDown,
  ChevronDown,
} from "lucide-react";
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
  // Color carries the meaning: red = sold out, amber = low, default = healthy.
  const color =
    qty === 0 ? "text-red-600" : qty <= 5 ? "text-amber-600" : "text-foreground";
  return (
    <span className={cn("font-medium tabular-nums", color)}>{qty}</span>
  );
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

function ExportMenu({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const item =
    "block rounded-md px-3 py-2 transition-colors hover:bg-muted cursor-pointer";
  return (
    <div className="relative">
      <Button variant="secondary" onClick={() => setOpen((o) => !o)}>
        <FileDown className="h-4 w-4" />
        Exportar PDF
        <ChevronDown className="h-4 w-4 opacity-60" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1.5 w-60 overflow-hidden rounded-lg border border-border bg-background p-1 shadow-pop">
            <a
              href="/api/inventario/export?variant=public"
              onClick={() => setOpen(false)}
              className={item}
            >
              <p className="text-sm font-medium">Lista para cliente</p>
              <p className="text-xs text-muted-foreground">
                Solo precios de venta
              </p>
            </a>
            {isAdmin && (
              <a
                href="/api/inventario/export?variant=internal"
                onClick={() => setOpen(false)}
                className={item}
              >
                <p className="text-sm font-medium">Inventario interno</p>
                <p className="text-xs text-muted-foreground">
                  Costo, margen y stock
                </p>
              </a>
            )}
          </div>
        </>
      )}
    </div>
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
        <div className="flex items-center gap-2">
          {products.length > 0 && <ExportMenu isAdmin={isAdmin} />}
          {isAdmin && (
            <Button onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              Importar
            </Button>
          )}
        </div>
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
