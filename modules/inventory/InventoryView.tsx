"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryState, parseAsString, parseAsStringLiteral } from "nuqs";
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
  Camera,
  History,
} from "lucide-react";
import type { Inventory, Product } from "@/lib/types";
import { foto as urlFoto } from "@/lib/foto";
import { formatMXN } from "@/lib/money";
import {
  paginaInventario,
  estadisticasInventario,
  type EstadisticasInv,
} from "./buscar";
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
import { ProductPhotoModal } from "./ProductPhotoModal";
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
  | "image_url"
> & { ventas_anuales?: number | null };

function StockCell({ qty }: { qty: number }) {
  // Color carries the meaning: red = sold out, amber = low, default = healthy.
  const color =
    qty === 0 ? "text-red-600 dark:text-red-400" : qty <= 5 ? "text-amber-600 dark:text-amber-400" : "text-foreground";
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

function ExportMenu({ verCostos }: { verCostos: boolean }) {
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
            {verCostos && (
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

const SORT_KEYS = ["sku", "name", "category", "price", "quantity", "ventas"] as const;
type SortKey = (typeof SORT_KEYS)[number];
type Sort = { key: SortKey; dir: "asc" | "desc" };

// Alphabetical for text (locale + natural number order so "X7" < "X10"),
// numeric for price/stock.
function compareRows(a: InventoryRow, b: InventoryRow, key: SortKey): number {
  switch (key) {
    case "price":
      return a.price_cents - b.price_cents;
    case "quantity":
      return a.quantity - b.quantity;
    case "ventas":
      // Never imported sorts last either way: an unknown figure is not a zero.
      return (a.ventas_anuales ?? -1) - (b.ventas_anuales ?? -1);
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
  totalInicial,
  statsIniciales,
  inventories,
  puedeGestionar,
  verCostos,
  puedePrecios,
  verVentas,
}: {
  /** First page, rendered before any query runs. */
  products: InventoryRow[];
  totalInicial: number;
  statsIniciales: EstadisticasInv;
  inventories: Inventory[];
  puedeGestionar: boolean;
  verCostos: boolean;
  puedePrecios: boolean;
  verVentas: boolean;
}) {
  // Search, sort and warehouse live in the URL: a refresh (or the reload a new
  // deploy forces) keeps the screen exactly where the user left it, and the
  // address can be shared or bookmarked. `history: replace` keeps typing from
  // filling the back button.
  const [query, setQuery] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions({ history: "replace" }),
  );
  const [sortKey, setSortKey] = useQueryState(
    "sort",
    parseAsStringLiteral(SORT_KEYS).withOptions({ history: "replace" }),
  );
  const [sortDir, setSortDir] = useQueryState(
    "dir",
    parseAsStringLiteral(["asc", "desc"] as const)
      .withDefault("asc")
      .withOptions({ history: "replace" }),
  );
  const [selectedInv, setSelectedInv] = useQueryState(
    "inv",
    parseAsString.withDefault("all").withOptions({ history: "replace" }),
  );

  const sort: Sort | null = sortKey ? { key: sortKey, dir: sortDir } : null;

  // Cycle: none → asc → desc → none for the clicked column.
  function toggleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  }
  const [importOpen, setImportOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [foto, setFoto] = useState<InventoryRow | null>(null);
  const [newInvOpen, setNewInvOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const invName = useMemo(
    () => Object.fromEntries(inventories.map((i) => [i.id, i.name])),
    [inventories],
  );

  // Search, sort and paging all happen in the database now. The catalog used to
  // arrive whole and be filtered here, which is fine at 614 products and is
  // ~3 MB per page load at 21k.
  const PER_PAGE = 50;
  const [page, setPage] = useState(1);
  const [paged, setPaged] = useState<InventoryRow[]>(products);
  const [total, setTotal] = useState(totalInicial);
  const [stats, setStats] = useState(statsIniciales);
  const [cargando, setCargando] = useState(false);

  useEffect(() => setPage(1), [query, selectedInv, sortKey, sortDir]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    const t = setTimeout(async () => {
      try {
        const r = await paginaInventario({
          query,
          inventoryId: selectedInv === "all" ? null : selectedInv,
          orden: sortKey ? { key: sortKey, dir: sortDir } : null,
          page,
          perPage: PER_PAGE,
        });
        if (cancelado) return;
        setPaged(r.rows as InventoryRow[]);
        setTotal(r.total);
      } catch {
        if (!cancelado) setPaged([]);
      } finally {
        if (!cancelado) setCargando(false);
      }
    }, 180);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
    // `products` is in the deps on purpose, and it is what makes router.refresh()
    // work again. This list stopped rendering from that prop when search moved to
    // the server — it fetches its own page now — so after an import, an edit or a
    // stock adjustment the screen sat unchanged and looked like nothing had
    // happened. Seven call sites do router.refresh() expecting this list to
    // follow; that re-runs the server component and hands down a NEW array, which
    // is the signal to re-read. Threading a counter through each modal instead
    // would mean remembering it for every modal added later.
  }, [query, selectedInv, sortKey, sortDir, page, products]);

  // Header totals follow the warehouse filter, not the search: they describe
  // the stock, not the current result set.
  useEffect(() => {
    let cancelado = false;
    estadisticasInventario(selectedInv === "all" ? null : selectedInv)
      .then((s) => !cancelado && setStats(s))
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [selectedInv, statsIniciales]);

  const buscarCompat = useCallback(
    async (modelo: string) =>
      (
        await paginaInventario({
          query: modelo,
          inventoryId: selectedInv === "all" ? null : selectedInv,
          perPage: 4,
        })
      ).rows as InventoryRow[],
    [selectedInv],
  );

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const pageSafe = Math.min(page, totalPages);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {stats.productos} productos · {stats.piezas} unidades
            {puedeGestionar && " · toca un producto para editar"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stats.productos > 0 && <ExportMenu verCostos={verCostos} />}
          {puedeGestionar && inventories.length > 0 && (
            <Button variant="secondary" onClick={() => setManualOpen(true)}>
              <Plus className="h-4 w-4" />
              Producto
            </Button>
          )}
          {puedeGestionar && (
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
        {puedeGestionar && (
          <button
            onClick={() => setNewInvOpen(true)}
            className="flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-ring/40 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo
          </button>
        )}
      </div>

      {/* Three cards without the value one, so the row still fills its width
          instead of leaving a hole where the money used to be. */}
      <div
        className={cn(
          "grid grid-cols-2 gap-3",
          stats.valor_cents === null ? "sm:grid-cols-3" : "sm:grid-cols-4",
        )}
      >
        <Kpi label="Productos" value={String(stats.productos)} />
        <Kpi label="Unidades" value={String(stats.piezas)} />
        {stats.valor_cents !== null && (
          <Kpi
            label={`Valor (${stats.valor_base})`}
            value={formatMXN(stats.valor_cents)}
          />
        )}
        <Kpi label="Bajo / agotado" value={`${stats.bajos} / ${stats.agotados}`} />
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

        {stats.productos === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={Boxes}
              title="Sin productos"
              description={
                puedeGestionar
                  ? "Importa una foto o un Excel para cargar tu catálogo."
                  : "Pide a un administrador que cargue inventario."
              }
              action={
                puedeGestionar ? (
                  <Button onClick={() => setImportOpen(true)}>
                    <Upload className="h-4 w-4" />
                    Importar inventario
                  </Button>
                ) : undefined
              }
              className="border-0"
            />
          </div>
        ) : paged.length === 0 ? (
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
                buscar={buscarCompat}
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
                <th className="w-16 px-4 py-2 font-medium">
                  <span className="sr-only">Foto</span>
                </th>
                <SortableTh label="SKU" k="sku" sort={sort} onSort={toggleSort} className="hidden sm:table-cell" />
                <SortableTh label="Producto" k="name" sort={sort} onSort={toggleSort} />
                <SortableTh label="Categoría" k="category" sort={sort} onSort={toggleSort} className="hidden sm:table-cell" />
                <SortableTh label="Precio" k="price" sort={sort} onSort={toggleSort} align="right" className="hidden text-right sm:table-cell" />
                {verVentas && (
                  <SortableTh
                    label="Ventas (año)"
                    k="ventas"
                    sort={sort}
                    onSort={toggleSort}
                    align="right"
                    className="hidden text-right sm:table-cell"
                  />
                )}
                <SortableTh label="Stock" k="quantity" sort={sort} onSort={toggleSort} align="right" className="text-right" />
                <th className="w-10 px-2 py-2 font-medium">
                  <span className="sr-only">Historial</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.map((p) => (
                <tr
                  key={p.id}
                  onClick={puedeGestionar ? () => setEditId(p.id) : undefined}
                  className={cn(
                    "border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40",
                    puedeGestionar && "cursor-pointer",
                  )}
                >
                  {/* Photo — open to every staff member (no cost/stock here),
                      unlike the admin-only row click that opens the full edit. */}
                  <td className="px-4 py-2.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFoto(p);
                      }}
                      aria-label={`Foto de ${p.name}`}
                      title={p.image_url ? "Cambiar foto" : "Agregar foto"}
                      className={cn(
                        "flex h-11 w-11 cursor-pointer items-center justify-center overflow-hidden rounded-lg border bg-background transition-colors",
                        p.image_url
                          ? "border-border hover:border-ring/40"
                          : "border-dashed border-border text-muted-foreground hover:border-ring/40 hover:text-foreground",
                      )}
                    >
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={urlFoto(p.image_url, 128)}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                    </button>
                  </td>
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
                  {verVentas && (
                    <td className="hidden px-4 py-2.5 text-right font-mono tabular-nums sm:table-cell">
                      {/* A dash, not a zero: most of the catalogue simply has no
                          figure yet, and "0" would read as "never sold". */}
                      {p.ventas_anuales == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        p.ventas_anuales.toLocaleString("es-MX")
                      )}
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-right">
                    <StockCell qty={p.quantity} />
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <Link
                      href={`/inventario/${p.id}`}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Historial de ${p.name}`}
                      title="Ver historial (cárdex)"
                      className="inline-flex cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <History className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {total > PER_PAGE && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground tabular-nums">
            {(pageSafe - 1) * PER_PAGE + 1}–{Math.min(pageSafe * PER_PAGE, total)} de {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pageSafe <= 1}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={pageSafe >= totalPages}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

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

      {manualOpen && (
        <ManualProductModal
          inventories={inventories}
          defaultInventoryId={selectedInv !== "all" ? selectedInv : undefined}
          verCostos={verCostos}
          onClose={() => setManualOpen(false)}
        />
      )}

      {editId && (
        <ProductEditModal
          productId={editId}
          verCostos={verCostos}
          puedePrecios={puedePrecios}
          onClose={() => setEditId(null)}
        />
      )}

      {foto && (
        <ProductPhotoModal
          productId={foto.id}
          nombre={foto.name}
          imagenActual={foto.image_url ?? null}
          onClose={() => setFoto(null)}
        />
      )}
    </section>
  );
}
