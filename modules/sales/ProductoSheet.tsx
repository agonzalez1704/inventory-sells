"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Expand, ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMXN } from "@/lib/money";
import { foto } from "@/lib/foto";
import { cn } from "@/lib/utils";
import { Thumb, type SalesProduct } from "./SalesScreen";
import { galeriaProducto } from "@/modules/inventory/actions";
import {
  tagsDeProducto,
  compatiblesDe,
  type Tag,
  type ProductoCompatible,
} from "@/modules/tags/actions";
import { garantiasEnStock, type GarantiaEnStock } from "@/modules/garantias/cliente-actions";
import { conversionesDe, descripcionDe } from "@/modules/catalogo/actions";
import { MARCA } from "@/lib/marca";
import { lineaDeSku } from "@/lib/linea";
import { filasDeSku, productosPorId } from "@/modules/inventory/buscar";

// Everything the register knows about a product, for the seller who is holding
// it and needs to answer a question at the counter. Reached by pressing and
// holding the card, so it must never be the only route to something: it is a
// shortcut to reading, not a step in making a sale.
export function ProductoSheet({
  p,
  filas = [],
  enCarrito = {},
  verCostos,
  onClose,
  onAgregar,
  onAnotarDemanda,
  agrupar,
  esPedido,
  onAbrir,
  volverA,
  onVolver,
}: {
  p: SalesProduct | null;
  /** Every stock row of this part number, best first; 2+ means several almacenes. */
  filas?: SalesProduct[];
  enCarrito?: Record<string, number>;
  verCostos: boolean;
  onClose: () => void;
  onAgregar: (p: SalesProduct) => void;
  /** A piece at zero is a sale being lost: offer to write the request down. */
  onAnotarDemanda?: (p: SalesProduct) => void;
  /** Rows → one group per part number, best row first (the POS's own order). */
  agrupar?: (ps: SalesProduct[]) => SalesProduct[][];
  /** A row from a supplier's almacén: adding it opens the bajo-pedido order. */
  esPedido?: (p: SalesProduct) => boolean;
  /** Open another part (a conversión or a compatible) in this same sheet. */
  onAbrir?: (p: SalesProduct, filas: SalesProduct[]) => void;
  /** Name of the part this one was opened from, to go back to it. */
  volverA?: string | null;
  onVolver?: () => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [vistas, setVistas] = useState<string[]>([]);
  const [sel, setSel] = useState(0);
  const [tags, setTags] = useState<Tag[]>([]);
  const [verTodasTags, setVerTodasTags] = useState(false);
  const [compatibles, setCompatibles] = useState<ProductoCompatible[]>([]);
  const [garantias, setGarantias] = useState<GarantiaEnStock[]>([]);
  const [conversiones, setConversiones] = useState<Awaited<ReturnType<typeof conversionesDe>>["conversiones"]>([]);
  const [numeros, setNumeros] = useState<string[]>([]);
  const [descripcion, setDescripcion] = useState<string | null>(null);
  // Each equivalent part with its rows per almacén, so it can be added here.
  const [convGrupos, setConvGrupos] = useState<SalesProduct[][]>([]);
  // Hidden until asked: the seller screenshots this sheet for the customer.
  const [costoVisible, setCostoVisible] = useState(false);
  // Compatibility arrives a beat after the sheet opens: hold its place with a
  // skeleton so the sections don't pop in and shove the sheet around.
  const [cargando, setCargando] = useState(false);
  // The product changes while the sheet is open (tapping another card): a
  // stale fullscreen — or the previous part's gallery — must not survive it.
  useEffect(() => {
    setFullscreen(false);
    setSel(0);
    setVistas([]);
    setTags([]);
    setVerTodasTags(false);
    setCompatibles([]);
    setGarantias([]);
    setConversiones([]);
    setNumeros([]);
    setDescripcion(null);
    setConvGrupos([]);
    setCostoVisible(false);
    if (!p?.id) return;
    let on = true;
    setCargando(true);
    galeriaProducto(p.id)
      .then((v) => on && setVistas(v))
      .catch(() => {});
    const tagsP = tagsDeProducto(p.id)
      .then((t) => on && setTags(t))
      .catch(() => {});
    // The same part in another almacén is not a compatible: "Por almacén" has it.
    const compatP = compatiblesDe(p.id, 7)
      .then((c) => on && setCompatibles(c.filter((x) => x.sku.trim().toUpperCase() !== p.sku.trim().toUpperCase()).slice(0, 6)))
      .catch(() => {});
    garantiasEnStock(p.id)
      .then((g) => on && setGarantias(g))
      .catch(() => {});
    const convP = conversionesDe(p.id)
      .then(async (c) => {
        if (!on) return;
        setConversiones(c.conversiones);
        setNumeros(c.numeros);
        if (!agrupar || c.ids.length === 0) return;
        const filas = (await productosPorId(c.ids)) as SalesProduct[];
        if (on) setConvGrupos(agrupar(filas));
      })
      .catch(() => {});
    descripcionDe(p.id)
      .then((d) => on && setDescripcion(d))
      .catch(() => {});
    Promise.allSettled([tagsP, compatP, convP]).then(() => on && setCargando(false));
    return () => {
      on = false;
    };
  }, [p?.id]);
  if (!p) return null;

  async function abrirCompatible(sku: string) {
    if (!onAbrir) return;
    const filas = (await filasDeSku(sku).catch(() => [])) as SalesProduct[];
    const g = agrupar ? agrupar(filas)[0] : filas;
    if (g?.length) onAbrir(g[0], g);
  }

  // Main photo first, supplier views after; sel indexes into this.
  const imagenes = [p.image_url, ...vistas].filter(Boolean) as string[];
  const imagen = imagenes[sel] ?? p.image_url;

  const costos = verCostos && costoVisible;
  const margen =
    costos && (p.cost_cents ?? 0) > 0 && p.price_cents > 0
      ? Math.round(((p.price_cents - (p.cost_cents ?? 0)) / (p.cost_cents ?? 1)) * 100)
      : null;

  // Same part in two almacenes: price, stock and the add button go per almacén.
  const almacenes = filas.length > 1 ? filas : null;
  const datos: [string, string | null][] = [
    [MARCA.id === "ruli" ? "No. de parte" : "SKU", p.sku],
    ["Marca", p.brand],
    // Auto parts: the category holds the owner's refacción (the Línea is retired).
    [MARCA.id === "ruli" ? "Refacción" : "Categoría", p.category],
    ["Tamaño", p.size],
    ...(almacenes
      ? []
      : ([["Precio", p.price_cents ? formatMXN(p.price_cents) : "Sin precio"]] as [string, string | null][])),
    // Cost and margin answer to the same permiso the rest of the app uses.
    ...(costos && !almacenes
      ? ([
          ["Costo", p.cost_cents ? formatMXN(p.cost_cents) : "—"],
          ["Margen", margen === null ? "—" : `${margen}%`],
        ] as [string, string | null][])
      : []),
    ...(almacenes
      ? []
      : ([
          ["Sucursal", p.sucursal_name ?? null],
          ["Inventario", p.inventory_name ?? null],
          ["Existencia", `${p.quantity}`],
        ] as [string, string | null][])),
  ];

  return (
    <Modal open onClose={onClose} title={p.name} className="max-w-2xl">
      {volverA && onVolver && (
        <button
          type="button"
          onClick={onVolver}
          className="mb-3 inline-flex h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-full bg-indigo-50 px-3 text-xs font-semibold text-indigo-800 transition-colors hover:bg-indigo-100 active:scale-[0.97] dark:bg-indigo-950/40 dark:text-indigo-300"
        >
          <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Volver a {volverA}</span>
        </button>
      )}
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
              <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-lg bg-background/80 text-foreground shadow-sm backdrop-blur-xs transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
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
            {datos
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 px-3 py-2">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="text-right font-mono text-sm tabular-nums">{v}</dd>
                </div>
              ))}
          </dl>
          {verCostos && (
            <button
              type="button"
              onClick={() => setCostoVisible((v) => !v)}
              className="mt-2 inline-flex h-7 cursor-pointer items-center gap-1.5 self-end rounded-full border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground active:scale-[0.97]"
            >
              {costoVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {costoVisible ? "Ocultar costo" : "Ver costo"}
            </button>
          )}

          {/* The click that opens this replaced the tap that added, so the
              sheet must offer adding back — anchored to the column's foot. */}
          {almacenes ? (
            <div className="mt-4 sm:mt-auto">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Por almacén</p>
              <ul className="divide-y divide-border rounded-xl border border-border">
                {almacenes.map((f) => {
                  const lleno = (enCarrito[f.id] ?? 0) >= f.quantity;
                  return (
                    <li key={f.id} className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {f.inventory_name ?? "Sin almacén"}
                          {f.sucursal_name ? <span className="text-muted-foreground"> · {f.sucursal_name}</span> : null}
                        </span>
                        <span className="block font-mono text-xs tabular-nums text-muted-foreground">
                          {f.price_cents ? formatMXN(f.price_cents) : "Sin precio"}
                          {costos && f.cost_cents ? ` · costo ${formatMXN(f.cost_cents)}` : ""}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 text-xs font-semibold tabular-nums",
                          f.quantity > 0 ? "text-emerald-700" : "text-red-700",
                        )}
                      >
                        {f.quantity > 0 ? `${f.quantity} pzs` : "Agotado"}
                      </span>
                      <Button
                        size="sm"
                        className="shrink-0"
                        disabled={f.quantity === 0 || lleno}
                        onClick={() => {
                          onAgregar(f);
                          onClose();
                        }}
                      >
                        Agregar
                      </Button>
                    </li>
                  );
                })}
              </ul>
              {onAnotarDemanda && almacenes.every((f) => f.quantity === 0) && (
                <Button variant="brand" className="mt-2 w-full" onClick={() => onAnotarDemanda(p)}>
                  Anotar que la piden
                </Button>
              )}
            </div>
          ) : p.quantity === 0 && onAnotarDemanda ? (
            <div className="mt-4 space-y-2 sm:mt-auto">
              <p className="rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                Sin piezas. Anótalo para que el resurtido lo tome en cuenta.
              </p>
              <Button variant="brand" className="w-full" onClick={() => onAnotarDemanda(p)}>
                Anotar que la piden
              </Button>
            </div>
          ) : (
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
          )}
        </div>
      </div>

      {garantias.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 p-3 dark:border-amber-700/50 dark:bg-amber-950/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
            Pieza de garantía en el estante
          </p>
          {garantias.map((g) => (
            <p key={g.id} className="mt-1 text-xs text-amber-800 dark:text-amber-200">
              {g.qty} {g.qty === 1 ? "pza reingresada" : "pzas reingresadas"} por
              garantía de <span className="font-medium">{g.cliente}</span> (
              {new Date(g.fecha).toLocaleDateString("es-MX", { day: "numeric", month: "short" })})
              {g.motivo ? ` · ${g.motivo}` : ""} — pruébala antes de revenderla.
            </p>
          ))}
        </div>
      )}

      {descripcion && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{descripcion}</p>}

      {!cargando && (conversiones.length > 0 || numeros.length > 0) && (
        <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-900 dark:bg-indigo-950/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-300">Conversiones</p>
          {convGrupos.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {convGrupos.map((g) => (
                <ConversionFila
                  key={g[0].sku}
                  filas={g}
                  enCarrito={enCarrito}
                  esPedido={esPedido}
                  onAbrir={onAbrir ? () => onAbrir(g[0], g) : undefined}
                  onAgregar={(f) => {
                    onAgregar(f);
                    onClose();
                  }}
                />
              ))}
            </ul>
          ) : conversiones.map((c) => (
            <p key={c.sku} className="mt-1.5 flex items-center gap-2 text-sm">
              <span className="font-mono text-xs font-bold">{c.sku}</span>
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="font-mono text-xs">{c.price_cents ? formatMXN(c.price_cents) : "—"}</span>
              <span className={c.quantity > 0 ? "text-xs font-semibold text-emerald-700" : "text-xs font-semibold text-red-700"}>
                {c.quantity > 0 ? `${c.quantity} pzs` : "Agotada"}
              </span>
            </p>
          ))}
          {numeros.length > 0 && (
            <p className="mt-2 text-xs text-indigo-900/80 dark:text-indigo-200/80">
              Otras marcas (no se manejan): <span className="font-mono font-semibold">{numeros.join(" · ")}</span>
            </p>
          )}
        </div>
      )}

      {cargando && (
        <div aria-busy="true" aria-label="Cargando compatibilidad" className="mt-4 space-y-4 border-t border-border pt-3">
          <div>
            <div className="h-3 w-28 animate-pulse rounded bg-muted" />
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {[96, 120, 84, 132, 104, 90].map((w, i) => (
                <div key={i} className="h-6 animate-pulse rounded-full bg-muted" style={{ width: w }} />
              ))}
            </div>
          </div>
          <div>
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            <div className="mt-2 divide-y divide-border rounded-xl border border-border">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-muted" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="h-2.5 w-1/4 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="h-3 w-14 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!cargando && tags.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Compatible con
          </p>
          {/* Full width so chips flow 3-4 per row instead of stacking one per
              line in the half column. Capped at 8: a 20-vehicle part must not
              bury the add button below the fold. */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(verTodasTags ? tags : tags.slice(0, 8)).map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-600/20 dark:bg-sky-950/40 dark:text-sky-300"
              >
                {t.nombre}
              </span>
            ))}
            {tags.length > 8 && (
              <button
                type="button"
                onClick={() => setVerTodasTags((v) => !v)}
                className="inline-flex cursor-pointer items-center rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-ring/40 hover:text-foreground active:scale-[0.97]"
              >
                {verTodasTags ? "Ver menos" : `+${tags.length - 8} más`}
              </button>
            )}
          </div>
        </div>
      )}

      {!cargando && compatibles.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Compatibles ({compatibles.length})
          </p>
          <ul className="mt-2 divide-y divide-border rounded-xl border border-border">
            {compatibles.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={!onAbrir}
                  onClick={() => abrirCompatible(c.sku)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors enabled:cursor-pointer enabled:hover:bg-muted/60"
                >
                <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-border bg-background">
                  {c.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={foto(c.image_url, 64)} alt="" className="h-full w-full object-contain" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{c.name}</span>
                  <span className="block font-mono text-[11px] uppercase text-muted-foreground">
                    {c.sku}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm tabular-nums">
                    {formatMXN(c.price_cents)}
                  </span>
                  <span
                    className={cn(
                      "block text-[11px]",
                      c.quantity > 0 ? "text-muted-foreground" : "text-red-600 dark:text-red-400",
                    )}
                  >
                    {c.quantity > 0 ? `${c.quantity} en stock` : "Agotado"}
                  </span>
                </span>
                {onAbrir && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Portal to body, not markup in place: on the phone this sheet is a
          vaul drawer, which is transformed — position:fixed inside a transform
          anchors to the transform, not the viewport, and the "fullscreen"
          would be a box trapped inside the drawer. */}
      {fullscreen && imagen &&
        createPortal(
          <div
            className="fixed inset-0 z-70 flex items-center justify-center bg-black/90 p-4"
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
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-xs"
            >
              <X className="h-5 w-5" />
            </button>
          </div>,
          document.body,
        )}
    </Modal>
  );
}

/** One equivalent part: its brand and line, the best almacén's price and the
 *  button that adds it (or orders it, from a supplier's almacén). The rest of
 *  the row opens it in the sheet. */
function ConversionFila({
  filas,
  enCarrito,
  esPedido,
  onAbrir,
  onAgregar,
}: {
  filas: SalesProduct[];
  enCarrito: Record<string, number>;
  esPedido?: (p: SalesProduct) => boolean;
  onAbrir?: () => void;
  onAgregar: (p: SalesProduct) => void;
}) {
  const f = filas[0];
  const pedido = esPedido?.(f) ?? false;
  const lleno = !pedido && (enCarrito[f.id] ?? 0) >= f.quantity;
  // A second almacén that also has it: offered underneath, like the store's cards.
  const otra = filas.find((o) => o.id !== f.id && o.inventory_id !== f.inventory_id && o.quantity > 0);
  const linea = lineaDeSku(f.sku);
  return (
    <li className="rounded-xl border border-indigo-100 bg-background px-3 py-2 dark:border-indigo-900">
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!onAbrir}
          onClick={onAbrir}
          className="flex min-w-0 flex-1 items-center gap-2 text-left enabled:cursor-pointer"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold">
              {f.brand ?? "Sin marca"}
              {linea && <span className="font-medium text-indigo-700 dark:text-indigo-300"> · {linea}</span>}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              <span className="font-mono font-bold">{f.sku}</span> · {f.name}
            </span>
          </span>
          {onAbrir && <ChevronRight className="h-4 w-4 shrink-0 text-indigo-700 dark:text-indigo-300" />}
        </button>
        <span className="shrink-0 text-right">
          <span className="block font-mono text-sm font-bold tabular-nums">
            {f.price_cents ? formatMXN(f.price_cents) : "—"}
          </span>
          <span
            className={cn(
              "block text-[11px] font-semibold",
              pedido ? "text-amber-700" : f.quantity > 0 ? "text-emerald-700" : "text-red-700",
            )}
          >
            {f.inventory_name ?? "Sin almacén"} · {pedido ? "bajo pedido" : f.quantity > 0 ? `${f.quantity} pzs` : "agotada"}
          </span>
        </span>
        <Button
          size="sm"
          variant={pedido ? "secondary" : "primary"}
          className="shrink-0"
          disabled={(!pedido && f.quantity === 0) || lleno}
          onClick={() => onAgregar(f)}
        >
          {pedido ? "Pedir" : "Agregar"}
        </Button>
      </div>
      {otra && (
        <button
          type="button"
          onClick={() => onAgregar(otra)}
          className="mt-1 cursor-pointer text-xs text-muted-foreground hover:text-foreground"
        >
          o {esPedido?.(otra) ? "pedirlo" : "sacarlo"} de <b>{otra.inventory_name}</b> {otra.price_cents ? formatMXN(otra.price_cents) : ""} +
        </button>
      )}
    </li>
  );
}
