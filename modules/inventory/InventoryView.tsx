"use client";

import { useMemo, useState } from "react";
import {
  Boxes,
  PackageSearch,
  Upload,
  Search,
  FileDown,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Plus,
} from "lucide-react";
import type { Inventory, Product } from "@/lib/types";
import { formatMXN } from "@/lib/money";
import { searchProducts } from "@/lib/search";
import { CompatPanel } from "@/modules/compat/CompatPanel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { ImportPanel } from "./import/ImportPanel";
import { ProductEditModal } from "./ProductEditModal";
import { ManualProductModal } from "./ManualProductModal";

export type InventoryRow = Pick<
  Product,
  | "id"
  | "inventory_id"
  | "sku"
  | "name"
  | "category"
  | "brand"
  | "size"
  | "price_cents"
  | "quantity"
  | "etiqueta"
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

type SortKey = "sku" | "name" | "category" | "price" | "quantity";
type Sort = { key: SortKey; dir: "asc" | "desc" };

// Alphabetical for text (locale + natural number order so "X7" < "X10"),
// numeric for price/stock.
function compareRows(a: InventoryRow, b: InventoryRow, key: SortKey): number {
  switch (key) {
    case "price":
      return a.price_cents - b.price_cents;
    case "quantity":
      return a.quantity - b.quantity;
    case "sku":
      return a.sku.localeCompare(b.sku, "es", { numeric: true, sensitivity: "base" });
    case "name":
      return a.name.localeCompare(b.name, "es", { numeric: true, sensitivity: "base" });
    case "category":
      return (a.category ?? "").localeCompare(b.category ?? "", "es", {
        numeric: true,
        sensitivity: "base",
      });
  }
}

// Clickable column header: 1st click sorts asc, 2nd desc, 3rd clears.
function SortableTh({
  label,
  k,
  sort,
  onSort,
  align = "left",
  className,
}: {
  label: string;
  k: SortKey;
  sort: Sort | null;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort?.key === k;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <th className={cn("px-4 py-2.5 font-medium", className)}>
      <button
        onClick={() => onSort(k)}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className={cn("h-3.5 w-3.5", !active && "opacity-40")} />
      </button>
    </th>
  );
}

function InvTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function InventoryView({
  products,
  inventories,
  isAdmin,
}: {
  products: InventoryRow[];
  inventories: Inventory[];
  isAdmin: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort | null>(null);
  const [selectedInv, setSelectedInv] = useState<string>("all");

  // Cycle: none → asc → desc → none for the clicked column.
  function toggleSort(key: SortKey) {
    setSort((cur) => {
      if (cur?.key !== key) return { key, dir: "asc" };
      if (cur.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }
  const [importOpen, setImportOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [newInvOpen, setNewInvOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const invName = useMemo(
    () => Object.fromEntries(inventories.map((i) => [i.id, i.name])),
    [inventories],
  );

  const scoped = useMemo(
    () =>
      selectedInv === "all"
        ? products
        : products.filter((p) => p.inventory_id === selectedInv),
    [products, selectedInv],
  );

  const stats = useMemo(() => {
    const units = scoped.reduce((s, p) => s + p.quantity, 0);
    const value = scoped.reduce((s, p) => s + p.price_cents * p.quantity, 0);
    const low = scoped.filter((p) => p.quantity > 0 && p.quantity <= 5).length;
    const out = scoped.filter((p) => p.quantity === 0).length;
    return { units, value, low, out };
  }, [scoped]);

  // Brand-alias aware search: "moto g42" / "redmi note 7" find the shorthand
  // catalog names. See lib/search.ts.
  const filtered = useMemo(
    () => searchProducts(scoped, query),
    [query, scoped],
  );

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const c = compareRows(a, b, sort.key);
      return sort.dir === "asc" ? c : -c;
    });
    return arr;
  }, [filtered, sort]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {scoped.length} productos · {stats.units} unidades
            {isAdmin && " · toca un producto para editar"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {scoped.length > 0 && <ExportMenu isAdmin={isAdmin} />}
          {isAdmin && selectedInv !== "all" && (
            <Button variant="secondary" onClick={() => setManualOpen(true)}>
              <Plus className="h-4 w-4" />
              Producto
            </Button>
          )}
          {isAdmin && (
            <Button onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              Importar
            </Button>
          )}
        </div>
      </div>

      {/* Inventory selector */}
      <div className="flex flex-wrap items-center gap-2">
        <InvTab active={selectedInv === "all"} onClick={() => setSelectedInv("all")}>
          Todos
        </InvTab>
        {inventories.map((inv) => (
          <InvTab
            key={inv.id}
            active={selectedInv === inv.id}
            onClick={() => setSelectedInv(inv.id)}
          >
            {inv.name}
          </InvTab>
        ))}
        {isAdmin && (
          <button
            onClick={() => setNewInvOpen(true)}
            className="flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-ring/40 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Productos" value={String(scoped.length)} />
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

        {scoped.length === 0 ? (
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
            {query.trim() && (
              <CompatPanel
                query={query}
                products={scoped}
                renderItem={(p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">
                        {p.sku}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                      {formatMXN(p.price_cents)}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                        p.quantity > 0
                          ? "bg-accent-soft text-accent"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {p.quantity} disp.
                    </span>
                  </div>
                )}
              />
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <SortableTh label="SKU" k="sku" sort={sort} onSort={toggleSort} className="hidden sm:table-cell" />
                <SortableTh label="Producto" k="name" sort={sort} onSort={toggleSort} />
                <SortableTh label="Categoría" k="category" sort={sort} onSort={toggleSort} className="hidden sm:table-cell" />
                <SortableTh label="Precio" k="price" sort={sort} onSort={toggleSort} align="right" className="hidden text-right sm:table-cell" />
                <SortableTh label="Stock" k="quantity" sort={sort} onSort={toggleSort} align="right" className="text-right" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr
                  key={p.id}
                  onClick={isAdmin ? () => setEditId(p.id) : undefined}
                  className={cn(
                    "border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40",
                    isAdmin && "cursor-pointer",
                  )}
                >
                  <td className="hidden px-4 py-2.5 font-mono text-xs text-muted-foreground sm:table-cell">
                    {p.sku}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{p.name}</span>
                    {p.etiqueta && (
                      <Badge tone="warning" className="ml-2 align-middle">
                        {p.etiqueta}
                      </Badge>
                    )}
                    {selectedInv === "all" && (
                      <Badge
                        tone="accent"
                        className="ml-2 hidden align-middle sm:inline-flex"
                      >
                        {invName[p.inventory_id] ?? "—"}
                      </Badge>
                    )}
                    {(p.brand || p.size) && (
                      <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">
                        {[p.brand, p.size].filter(Boolean).join(" · ")}
                      </span>
                    )}
                    {/* On mobile the SKU/Categoría/Precio columns are hidden, so
                        surface that info compactly under the name. */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 sm:hidden">
                      <span className="font-mono text-xs text-muted-foreground">
                        {p.sku}
                      </span>
                      {selectedInv === "all" && (
                        <Badge tone="accent">{invName[p.inventory_id] ?? "—"}</Badge>
                      )}
                      {p.category && <Badge tone="neutral">{p.category}</Badge>}
                      <span className="font-mono text-xs font-medium tabular-nums">
                        {formatMXN(p.price_cents)}
                      </span>
                    </div>
                  </td>
                  <td className="hidden px-4 py-2.5 sm:table-cell">
                    {p.category ? (
                      <Badge tone="neutral">{p.category}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 text-right font-mono tabular-nums sm:table-cell">
                    {formatMXN(p.price_cents)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <StockCell qty={p.quantity} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Importar inventario"
      >
        <ImportPanel
          inventories={inventories}
          defaultInventoryId={selectedInv !== "all" ? selectedInv : undefined}
          onClose={() => setImportOpen(false)}
        />
      </Modal>

      <Modal
        open={newInvOpen}
        onClose={() => setNewInvOpen(false)}
        title="Nuevo inventario"
      >
        <ImportPanel newMode onClose={() => setNewInvOpen(false)} />
      </Modal>

      {manualOpen && selectedInv !== "all" && (
        <ManualProductModal
          inventoryId={selectedInv}
          inventoryName={invName[selectedInv]}
          onClose={() => setManualOpen(false)}
        />
      )}

      {editId && (
        <ProductEditModal productId={editId} onClose={() => setEditId(null)} />
      )}
    </section>
  );
}
