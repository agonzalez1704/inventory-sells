"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  useQueryState,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs";
import {
  Boxes,
  PackageSearch,
  Upload,
  Search,
  FileDown,
  ChevronDown,
  Plus,
  Camera,
  History,
  Pencil,
  SlidersHorizontal,
  RotateCcw,
  X,
} from "lucide-react";
import type { Inventory } from "@/lib/types";
import { foto as urlFoto } from "@/lib/foto";
import { formatMXN } from "@/lib/money";
import {
  listaInventario,
  estadisticasInventario,
  listarCategorias,
  type CategoriaConteo,
  type EstadisticasInv,
  type FilaInventario,
  type FiltrosInventario,
  type OrdenLista,
} from "./buscar";
import { CompatPanel } from "@/modules/compat/CompatPanel";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Drawer } from "@/components/ui/drawer";
import { ImportPanel } from "./import/ImportPanel";
import { ProductEditModal } from "./ProductEditModal";
import { ProductPhotoModal } from "./ProductPhotoModal";
import { ManualProductModal } from "./ManualProductModal";
import { EditarInventarioModal } from "./EditarInventarioModal";

export type InventoryRow = FilaInventario;

const ORDENES = ["vendidos", "stock_asc", "stock_desc", "precio_asc", "precio_desc"] as const;
const ORDEN_LABEL: Record<OrdenLista, string> = {
  vendidos: "Más vendidos · 30 días",
  stock_asc: "Menos existencia",
  stock_desc: "Más existencia",
  precio_asc: "Precio menor",
  precio_desc: "Precio mayor",
};

/** Today's threshold for "bajo" when a product has no reorder point of its own. */
const MINIMO_DEFAULT = 5;

function ExportMenu({ verCostos }: { verCostos: boolean }) {
  const [open, setOpen] = useState(false);
  const item = "block rounded-md px-3 py-2 transition-colors hover:bg-muted cursor-pointer";
  return (
    <div className="relative">
      <Button variant="secondary" onClick={() => setOpen((o) => !o)}>
        <FileDown className="h-4 w-4" />
        Exportar
        <ChevronDown className="h-4 w-4 opacity-60" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1.5 w-60 overflow-hidden rounded-lg border border-border bg-background p-1 shadow-pop">
            <a href="/api/inventario/export?variant=public" onClick={() => setOpen(false)} className={item}>
              <p className="text-sm font-medium">Lista para cliente</p>
              <p className="text-xs text-muted-foreground">Solo precios de venta</p>
            </a>
            {verCostos && (
              <a href="/api/inventario/export?variant=internal" onClick={() => setOpen(false)} className={item}>
                <p className="text-sm font-medium">Inventario interno</p>
                <p className="text-xs text-muted-foreground">Costo, margen y stock</p>
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Pill only when something needs attention: a healthy row stays quiet. */
function AlertaStock({ p }: { p: FilaInventario }) {
  const min = p.stock_minimo ?? MINIMO_DEFAULT;
  if (p.quantity <= 0) return <Badge tone="danger">Agotado</Badge>;
  if (p.quantity <= min) return <Badge tone="warning">Bajo mínimo ({min})</Badge>;
  return null;
}

function colorCantidad(p: FilaInventario) {
  const min = p.stock_minimo ?? MINIMO_DEFAULT;
  return p.quantity <= 0
    ? "text-red-600 dark:text-red-400"
    : p.quantity <= min
      ? "text-amber-600 dark:text-amber-400"
      : "text-foreground";
}

export function InventoryView({
  products,
  totalInicial,
  statsIniciales,
  inventories,
  sucursales,
  conteos,
  puedeGestionar,
  verCostos,
  puedePrecios,
  verVentas,
}: {
  /** First page, rendered before any query runs. */
  products: FilaInventario[];
  totalInicial: number;
  statsIniciales: EstadisticasInv;
  inventories: Inventory[];
  /** sucursal id → name, to say where each inventory physically is. */
  sucursales: Record<string, string>;
  /** inventory id → active products. */
  conteos: Record<string, number>;
  puedeGestionar: boolean;
  verCostos: boolean;
  puedePrecios: boolean;
  verVentas: boolean;
}) {
  // Every filter lives in the URL: a refresh (or the reload a new deploy
  // forces) keeps the screen where the user left it, and a filtered view can
  // be shared. `history: replace` keeps typing out of the back button.
  const opt = { history: "replace" as const };
  const [query, setQuery] = useQueryState("q", parseAsString.withDefault("").withOptions(opt));
  const [selectedInv, setSelectedInv] = useQueryState("inv", parseAsString.withDefault("all").withOptions(opt));
  const [alerta, setAlerta] = useQueryState("alerta", parseAsStringLiteral(["bajo", "agotado"] as const).withOptions(opt));
  const [cat, setCat] = useQueryState("cat", parseAsString.withOptions(opt));
  const [pmin, setPmin] = useQueryState("pmin", parseAsInteger.withOptions(opt));
  const [pmax, setPmax] = useQueryState("pmax", parseAsInteger.withOptions(opt));
  const [orden, setOrden] = useQueryState("orden", parseAsStringLiteral(ORDENES).withOptions(opt));

  const [importOpen, setImportOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [foto, setFoto] = useState<FilaInventario | null>(null);
  const [newInvOpen, setNewInvOpen] = useState(false);
  const [editInv, setEditInv] = useState<Inventory | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [filtrosOpen, setFiltrosOpen] = useState(false);

  const invName = useMemo(() => Object.fromEntries(inventories.map((i) => [i.id, i.name])), [inventories]);
  const inv = selectedInv === "all" ? null : selectedInv;

  const filtros: FiltrosInventario = useMemo(
    () => ({ inv, alerta, cat, pmin, pmax, orden }),
    [inv, alerta, cat, pmin, pmax, orden],
  );
  // The inventory chooser is not counted: it has its own always-visible place.
  const activos = [alerta, cat, pmin ?? pmax, orden].filter((x) => x != null).length;

  const PER_PAGE = 50;
  const [page, setPage] = useState(1);
  const [paged, setPaged] = useState<FilaInventario[]>(products);
  const [total, setTotal] = useState(totalInicial);
  const [stats, setStats] = useState(statsIniciales);
  const [categorias, setCategorias] = useState<CategoriaConteo[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => setPage(1), [query, filtros]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    const t = setTimeout(async () => {
      try {
        const r = await listaInventario({ query, filtros, page, perPage: PER_PAGE });
        if (cancelado) return;
        setPaged(r.rows);
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
    // `products` is a dependency on purpose: modals call router.refresh() after
    // an import, an edit or a stock adjustment, which hands down a NEW array —
    // the signal to read the page again.
  }, [query, filtros, page, products]);

  // Header numbers and alert counts follow the inventory, not the search: they
  // describe the stock.
  useEffect(() => {
    let cancelado = false;
    estadisticasInventario(inv)
      .then((s) => !cancelado && setStats(s))
      .catch(() => {});
    listarCategorias(inv)
      .then((c) => !cancelado && setCategorias(c))
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [inv, statsIniciales]);

  const buscarCompat = useCallback(
    async (modelo: string) =>
      (await listaInventario({ query: modelo, filtros: { inv }, perPage: 4 })).rows,
    [inv],
  );

  function restablecer() {
    setAlerta(null);
    setCat(null);
    setPmin(null);
    setPmax(null);
    setOrden(null);
  }

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const pageSafe = Math.min(page, totalPages);
  const totalProductos = Object.values(conteos).reduce((s, n) => s + n, 0);

  const panelFiltros = (
    <PanelFiltros
      inventories={inventories}
      sucursales={sucursales}
      conteos={conteos}
      totalProductos={totalProductos}
      inv={inv}
      onInv={(id) => setSelectedInv(id ?? "all")}
      onEditarInv={puedeGestionar ? setEditInv : null}
      onNuevoInv={puedeGestionar ? () => setNewInvOpen(true) : null}
      stats={stats}
      alerta={alerta}
      onAlerta={setAlerta}
      categorias={categorias}
      cat={cat}
      onCat={setCat}
      pmin={pmin}
      pmax={pmax}
      onPrecio={(a, b) => {
        setPmin(a);
        setPmax(b);
      }}
      orden={orden}
      onOrden={setOrden}
      buscando={query.trim().length > 0}
      onReset={restablecer}
      hayFiltros={activos > 0}
    />
  );

  // Desktop row grid: columns the reader may not see simply are not there.
  const columnas = ["44px", "minmax(0,1fr)", "200px", verVentas ? "100px" : null, "88px", verCostos ? "88px" : null, "36px"]
    .filter(Boolean)
    .join(" ");

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Inventario</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {stats.productos.toLocaleString("es-MX")} productos · {stats.piezas.toLocaleString("es-MX")} piezas
            {stats.valor_cents !== null && (
              <span className="hidden sm:inline">
                {" "}
                · <span className="tabular-nums">{formatMXN(stats.valor_cents)}</span> a{" "}
                {stats.valor_base === "costo" ? "costo" : "precio de venta"}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 sm:flex">
            {stats.productos > 0 && <ExportMenu verCostos={verCostos} />}
            {puedeGestionar && (
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" />
                Importar
              </Button>
            )}
          </div>
          {puedeGestionar && inventories.length > 0 && (
            <Button onClick={() => setManualOpen(true)}>
              <Plus className="h-4 w-4" />
              Producto
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="relative max-w-2xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busca por nombre, SKU o modelo…"
            className="h-11 pl-9 text-base sm:text-sm"
          />
        </div>

        {/* Phone: the filters that matter most are one tap; the rest in a sheet. */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setFiltrosOpen(true)}
            className={cn(
              "inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-medium",
              activos > 0 || inv ? "bg-primary text-primary-foreground" : "border border-border bg-background",
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {activos + (inv ? 1 : 0) > 0 && (
              <span className="rounded-full bg-brand px-1.5 text-xs text-brand-foreground">{activos + (inv ? 1 : 0)}</span>
            )}
          </button>
          <ChipAlerta activa={alerta === "agotado"} onClick={() => setAlerta(alerta === "agotado" ? null : "agotado")}>
            Agotado <b className="tabular-nums text-red-600 dark:text-red-400">{stats.agotados}</b>
          </ChipAlerta>
          <ChipAlerta activa={alerta === "bajo"} onClick={() => setAlerta(alerta === "bajo" ? null : "bajo")}>
            Bajo mínimo <b className="tabular-nums text-amber-600 dark:text-amber-400">{stats.bajos}</b>
          </ChipAlerta>
          {inv && (
            <button
              type="button"
              onClick={() => setSelectedInv("all")}
              className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-brand-soft px-4 text-sm font-medium text-brand-foreground"
            >
              {invName[inv] ?? "Inventario"}
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6">
        <aside className="hidden lg:sticky lg:top-4 lg:block lg:self-start">{panelFiltros}</aside>

        <Card className={cn("overflow-hidden transition-opacity", cargando && "opacity-70")}>
          {stats.productos === 0 && !inv ? (
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
          ) : paged.length === 0 && !cargando ? (
            <div className="p-6">
              <EmptyState
                icon={PackageSearch}
                title="Sin resultados"
                description={query.trim() ? `Nada coincide con “${query}”.` : "Nada coincide con estos filtros."}
                action={
                  activos > 0 ? (
                    <Button variant="secondary" onClick={restablecer}>
                      <RotateCcw className="h-4 w-4" />
                      Restablecer filtros
                    </Button>
                  ) : undefined
                }
                className="border-0"
              />
              {query.trim() && (
                <CompatPanel
                  query={query}
                  buscar={buscarCompat}
                  renderItem={(p) => (
                    <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-background p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        <p className="truncate font-mono text-xs text-muted-foreground">{p.sku}</p>
                      </div>
                      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">{formatMXN(p.price_cents)}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                          p.quantity > 0 ? "bg-accent-soft text-accent" : "bg-muted text-muted-foreground",
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
            <>
              <div
                className="hidden h-10 items-center gap-3 border-b border-border px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid"
                style={{ gridTemplateColumns: columnas }}
              >
                <span />
                <span>Producto</span>
                <span>Existencia</span>
                {verVentas && <span className="text-right">Vendidas</span>}
                <span className="text-right">Precio</span>
                {verCostos && <span className="text-right">Costo</span>}
                <span />
              </div>
              <ul>
                {paged.map((p) => (
                  <li
                    key={p.id}
                    onClick={puedeGestionar ? () => setEditId(p.id) : undefined}
                    className={cn(
                      "border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40",
                      puedeGestionar && "cursor-pointer",
                    )}
                  >
                    {/* Phone */}
                    <div className="flex items-center gap-3 px-3 py-2.5 lg:hidden">
                      <FotoBoton p={p} onClick={() => setFoto(p)} size="lg" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold">{p.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {inv ? p.sku : (invName[p.inventory_id] ?? "—")} · {formatMXN(p.price_cents)}
                        </p>
                        <div className="mt-1 flex items-center gap-1.5">
                          <AlertaStock p={p} />
                          {p.etiqueta && <Badge tone="warning">{p.etiqueta}</Badge>}
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className={cn("text-xl font-semibold tabular-nums", colorCantidad(p))}>{p.quantity}</span>
                        <span className="text-[11px] text-muted-foreground">en stock</span>
                      </div>
                    </div>

                    {/* Desktop */}
                    <div className="hidden min-h-16 items-center gap-3 px-4 py-2 lg:grid" style={{ gridTemplateColumns: columnas }}>
                      <FotoBoton p={p} onClick={() => setFoto(p)} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {p.name}
                          {p.etiqueta && (
                            <Badge tone="warning" className="ml-2 align-middle">
                              {p.etiqueta}
                            </Badge>
                          )}
                        </p>
                        <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="truncate font-mono">{p.sku}</span>
                          {p.category && <span className="shrink-0">· {p.category}</span>}
                          {!inv && (
                            <Badge tone="neutral" className="shrink-0">
                              {invName[p.inventory_id] ?? "—"}
                            </Badge>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn("w-8 text-right text-base font-semibold tabular-nums", colorCantidad(p))}>
                          {p.quantity}
                        </span>
                        <AlertaStock p={p} />
                      </div>
                      {verVentas && (
                        <div className="text-right text-sm tabular-nums">
                          {p.ventas_30d}
                          <span className="text-xs text-muted-foreground"> /30 d</span>
                          {p.ventas_anuales != null && (
                            <p className="text-[11px] text-muted-foreground">
                              {p.ventas_anuales.toLocaleString("es-MX")}/año
                            </p>
                          )}
                        </div>
                      )}
                      <span className="text-right text-sm font-medium tabular-nums">{formatMXN(p.price_cents)}</span>
                      {verCostos && (
                        <span className="text-right text-sm tabular-nums text-muted-foreground">{formatMXN(p.cost_cents)}</span>
                      )}
                      <Link
                        href={`/inventario/${p.id}`}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Historial de ${p.name}`}
                        title="Ver historial (cárdex)"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <History className="h-4 w-4" />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      {total > PER_PAGE && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="tabular-nums text-muted-foreground">
            {(pageSafe - 1) * PER_PAGE + 1}–{Math.min(pageSafe * PER_PAGE, total)} de {total.toLocaleString("es-MX")}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={pageSafe <= 1}>
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

      <Drawer open={filtrosOpen} onClose={() => setFiltrosOpen(false)} title="Filtros">
        <div className="max-h-[70vh] overflow-y-auto px-1 pb-2">{panelFiltros}</div>
        <Button className="mt-3 h-12 w-full" onClick={() => setFiltrosOpen(false)}>
          Ver {total.toLocaleString("es-MX")} productos
        </Button>
      </Drawer>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Importar inventario">
        <ImportPanel
          inventories={inventories}
          defaultInventoryId={inv ?? undefined}
          onClose={() => setImportOpen(false)}
        />
      </Modal>

      <Modal open={newInvOpen} onClose={() => setNewInvOpen(false)} title="Nuevo inventario">
        <ImportPanel newMode onClose={() => setNewInvOpen(false)} />
      </Modal>

      {manualOpen && (
        <ManualProductModal
          inventories={inventories}
          defaultInventoryId={inv ?? undefined}
          verCostos={verCostos}
          onClose={() => setManualOpen(false)}
        />
      )}

      {editInv && <EditarInventarioModal inventario={editInv} onClose={() => setEditInv(null)} />}

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

function ChipAlerta({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={cn(
        "inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-sm",
        activa ? "border-primary bg-muted font-medium" : "border-border bg-background",
      )}
    >
      {children}
    </button>
  );
}

// Photo — open to every staff member (no cost/stock in it), unlike the row
// click that opens the full editor.
function FotoBoton({ p, onClick, size = "md" }: { p: FilaInventario; onClick: () => void; size?: "md" | "lg" }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={`Foto de ${p.name}`}
      title={p.image_url ? "Cambiar foto" : "Agregar foto"}
      className={cn(
        "flex shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border bg-background transition-colors",
        size === "lg" ? "h-[52px] w-[52px]" : "h-11 w-11",
        p.image_url
          ? "border-border hover:border-ring/40"
          : "border-dashed border-border text-muted-foreground hover:border-ring/40 hover:text-foreground",
      )}
    >
      {p.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urlFoto(p.image_url, 128)} alt="" loading="lazy" className="h-full w-full object-contain" />
      ) : (
        <Camera className="h-4 w-4" />
      )}
    </button>
  );
}

/** The filter rail — the desktop column and the phone sheet share it. */
function PanelFiltros({
  inventories,
  sucursales,
  conteos,
  totalProductos,
  inv,
  onInv,
  onEditarInv,
  onNuevoInv,
  stats,
  alerta,
  onAlerta,
  categorias,
  cat,
  onCat,
  pmin,
  pmax,
  onPrecio,
  orden,
  onOrden,
  buscando,
  onReset,
  hayFiltros,
}: {
  inventories: Inventory[];
  sucursales: Record<string, string>;
  conteos: Record<string, number>;
  totalProductos: number;
  inv: string | null;
  onInv: (id: string | null) => void;
  onEditarInv: ((i: Inventory) => void) | null;
  onNuevoInv: (() => void) | null;
  stats: EstadisticasInv;
  alerta: "bajo" | "agotado" | null;
  onAlerta: (a: "bajo" | "agotado" | null) => void;
  categorias: CategoriaConteo[];
  cat: string | null;
  onCat: (c: string | null) => void;
  pmin: number | null;
  pmax: number | null;
  onPrecio: (min: number | null, max: number | null) => void;
  orden: OrdenLista | null;
  onOrden: (o: OrdenLista | null) => void;
  buscando: boolean;
  onReset: () => void;
  hayFiltros: boolean;
}) {
  // Typed prices apply on blur or Enter, not per keystroke: "1", "15", "150"
  // would be three list reloads for one number.
  const [min, setMin] = useState(pmin?.toString() ?? "");
  const [max, setMax] = useState(pmax?.toString() ?? "");
  useEffect(() => setMin(pmin?.toString() ?? ""), [pmin]);
  useEffect(() => setMax(pmax?.toString() ?? ""), [pmax]);
  const aplicarPrecio = () => {
    const a = min.trim() ? Math.max(0, Math.round(Number(min))) : null;
    const b = max.trim() ? Math.max(0, Math.round(Number(max))) : null;
    onPrecio(Number.isFinite(a) ? a : null, Number.isFinite(b) ? b : null);
  };

  const eyebrow = "px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";
  const opcion = (activa: boolean) =>
    cn(
      "flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors",
      activa ? "bg-brand-soft font-medium text-brand-foreground" : "hover:bg-muted",
    );

  return (
    <div className="space-y-5">
      <div className="space-y-0.5">
        <p className={cn(eyebrow, "pb-1")}>Inventario</p>
        <button type="button" onClick={() => onInv(null)} className={opcion(inv === null)}>
          <span className="flex-1">Todos</span>
          <span className="text-xs tabular-nums">{totalProductos.toLocaleString("es-MX")}</span>
        </button>
        {inventories.map((i) => {
          const activa = inv === i.id;
          const donde = i.es_dropship ? "dropship" : i.sucursal_id ? sucursales[i.sucursal_id] : null;
          return (
            <div key={i.id} className="group relative">
              <button type="button" onClick={() => onInv(i.id)} className={opcion(activa)}>
                <span className="min-w-0 flex-1 truncate">
                  {i.name}
                  {donde && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{donde}</span>}
                </span>
                <span className={cn("text-xs tabular-nums", activa && onEditarInv && "mr-7")}>
                  {(conteos[i.id] ?? 0).toLocaleString("es-MX")}
                </span>
              </button>
              {activa && onEditarInv && (
                <button
                  type="button"
                  onClick={() => onEditarInv(i)}
                  aria-label={`Editar ${i.name}`}
                  className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-brand-foreground hover:bg-background/60"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
        {onNuevoInv && (
          <button
            type="button"
            onClick={onNuevoInv}
            className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo inventario
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <p className={eyebrow}>Alerta de stock</p>
        {(
          [
            [null, "Todo", stats.productos, ""],
            ["bajo", "Bajo el mínimo", stats.bajos, "text-amber-600 dark:text-amber-400"],
            ["agotado", "Agotado", stats.agotados, "text-red-600 dark:text-red-400"],
          ] as const
        ).map(([valor, label, n, color]) => (
          <button
            key={label}
            type="button"
            onClick={() => onAlerta(valor)}
            aria-pressed={alerta === valor}
            className={cn(
              "flex h-10 w-full cursor-pointer items-center justify-between rounded-full border px-4 text-sm transition-colors",
              alerta === valor ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
            )}
          >
            {label}
            <span className={cn("tabular-nums font-semibold", alerta !== valor && color)}>
              {n.toLocaleString("es-MX")}
            </span>
          </button>
        ))}
      </div>

      <label className="block space-y-1.5">
        <span className={eyebrow}>Categoría</span>
        <select
          value={cat ?? ""}
          onChange={(e) => onCat(e.target.value || null)}
          className="h-10 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring/30 sm:text-sm"
        >
          <option value="">Todas ({categorias.length})</option>
          {categorias.map((c) => (
            <option key={c.categoria} value={c.categoria}>
              {c.categoria} ({c.productos})
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-1.5">
        <p className={eyebrow}>Precio</p>
        <div className="flex gap-2">
          {(
            [
              ["mín", min, setMin],
              ["máx", max, setMax],
            ] as const
          ).map(([ph, v, set]) => (
            <div key={ph} className="relative flex-1">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <input
                inputMode="numeric"
                value={v}
                placeholder={ph}
                onChange={(e) => set(e.target.value.replace(/[^\d]/g, ""))}
                onBlur={aplicarPrecio}
                onKeyDown={(e) => e.key === "Enter" && aplicarPrecio()}
                className="h-10 w-full rounded-lg border border-border bg-background pl-6 pr-2 text-base tabular-nums outline-none focus:ring-2 focus:ring-ring/30 sm:text-sm"
              />
            </div>
          ))}
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className={eyebrow}>Ordenar</span>
        <select
          value={orden ?? ""}
          onChange={(e) => onOrden((e.target.value || null) as OrdenLista | null)}
          className="h-10 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring/30 sm:text-sm"
        >
          <option value="">{buscando ? "Relevancia" : "Nombre A–Z"}</option>
          {ORDENES.map((o) => (
            <option key={o} value={o}>
              {ORDEN_LABEL[o]}
            </option>
          ))}
        </select>
      </label>

      {hayFiltros && (
        <button
          type="button"
          onClick={onReset}
          className="flex h-9 cursor-pointer items-center gap-1.5 px-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restablecer filtros
        </button>
      )}
    </div>
  );
}
