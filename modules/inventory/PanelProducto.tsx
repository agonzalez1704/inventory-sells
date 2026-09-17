"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRightToLine,
  Camera,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  History,
  Loader2,
  MapPin,
  MoreHorizontal,
  Pencil,
  ShoppingCart,
  Trash2,
  Truck,
  ArrowLeftRight,
} from "lucide-react";
import { foto as urlFoto } from "@/lib/foto";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CardexResumen, MovimientoCardex } from "@/modules/cardex/actions";
import {
  agregarNota,
  borrarNota,
  detalleProducto,
  duplicarProducto,
  historialProducto,
  notasProducto,
  setActivoProducto,
  setStockMinimo,
  type DetalleProducto,
  type NotaProducto,
} from "./panel-actions";
import { AjusteStock } from "./AjusteStock";

const MINIMO_DEFAULT = 5;
type Tab = "info" | "hist" | "notas";

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * The product, beside the list instead of over it (approved mockup, from the
 * user's reference video): stock with where it sits and its reorder point,
 * the cárdex as a tab, and the team's notes. ‹ › walks the current page.
 * Desktop: a side panel. Phone: the full screen.
 */
export function PanelProducto({
  productId,
  ids,
  onNavegar,
  onClose,
  puedeGestionar,
  verCostos,
  onEditar,
  onFoto,
}: {
  productId: string;
  /** Ids of the list as shown, for ‹ ›. */
  ids: string[];
  onNavegar: (id: string) => void;
  onClose: () => void;
  puedeGestionar: boolean;
  verCostos: boolean;
  onEditar: (id: string) => void;
  onFoto: (p: { id: string; name: string; image_url: string | null }) => void;
}) {
  const router = useRouter();
  const [p, setP] = useState<DetalleProducto | null>(null);
  const [tab, setTab] = useState<Tab>("info");
  const [menu, setMenu] = useState(false);
  const [ajustando, setAjustando] = useState(false);
  const [pending, start] = useTransition();

  const cargar = useCallback(() => {
    let vivo = true;
    detalleProducto(productId)
      .then((d) => vivo && setP(d))
      .catch(() => vivo && setP(null));
    return () => {
      vivo = false;
    };
  }, [productId]);

  useEffect(() => {
    setP(null);
    setAjustando(false);
    return cargar();
  }, [cargar]);

  const i = ids.indexOf(productId);
  const anterior = i > 0 ? ids[i - 1] : null;
  const siguiente = i >= 0 && i < ids.length - 1 ? ids[i + 1] : null;

  // Escape closes; arrows walk the list — unless the user is typing a note.
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (ajustando) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && anterior) onNavegar(anterior);
      else if (e.key === "ArrowRight" && siguiente) onNavegar(siguiente);
    };
    window.addEventListener("keydown", tecla);
    return () => {
      document.body.style.overflow = previo;
      window.removeEventListener("keydown", tecla);
    };
  }, [onClose, onNavegar, anterior, siguiente, ajustando]);

  function toggleActivo() {
    if (!p) return;
    const activo = !p.is_active;
    start(async () => {
      const r = await setActivoProducto(p.id, activo);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setP({ ...p, is_active: activo });
      toast.success(activo ? "Producto activo" : "Producto inactivo: ya no aparece en ventas ni en la tienda");
      router.refresh();
    });
  }

  function duplicar() {
    if (!p) return;
    setMenu(false);
    start(async () => {
      const r = await duplicarProducto(p.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Copia creada: cámbiale el nombre y el SKU");
      router.refresh();
      onNavegar(r.data.id);
      onEditar(r.data.id);
    });
  }

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Cerrar" className="absolute inset-0 hidden bg-black/40 sm:block" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={p?.name ?? "Producto"}
        className="absolute inset-0 flex flex-col bg-background shadow-2xl sm:left-auto sm:w-[min(780px,100%)] sm:border-l sm:border-border"
      >
        {/* Header actions */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5 sm:px-5">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar panel">
            <ArrowRightToLine className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
          {p && puedeGestionar && (
            <>
              <button
                type="button"
                role="switch"
                aria-checked={p.is_active}
                onClick={toggleActivo}
                disabled={pending}
                className="mr-1 flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-medium disabled:opacity-50"
              >
                <span
                  className={cn(
                    "relative h-5 w-9 rounded-full transition-colors",
                    p.is_active ? "bg-emerald-500" : "bg-muted-foreground/30",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                      p.is_active ? "left-[18px]" : "left-0.5",
                    )}
                  />
                </span>
                <span className="hidden sm:inline">{p.is_active ? "Activo" : "Inactivo"}</span>
              </button>
              <Button variant="secondary" size="sm" className="h-9" onClick={() => onEditar(p.id)}>
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            </>
          )}
          {p && (
            <div className="relative">
              <Button variant="secondary" size="icon" aria-label="Más acciones" onClick={() => setMenu((m) => !m)}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 z-20 mt-1.5 w-56 overflow-hidden rounded-lg border border-border bg-background p-1 shadow-pop">
                    <MenuItem
                      icon={Camera}
                      onClick={() => {
                        setMenu(false);
                        onFoto({ id: p.id, name: p.name, image_url: p.image_url });
                      }}
                    >
                      {p.image_url ? "Cambiar foto" : "Agregar foto"}
                    </MenuItem>
                    {puedeGestionar && (
                      <MenuItem icon={Copy} onClick={duplicar}>
                        Duplicar producto
                      </MenuItem>
                    )}
                    <Link
                      href={`/inventario/${p.id}`}
                      className="flex h-9 items-center gap-2 rounded-md px-2.5 text-sm hover:bg-muted"
                    >
                      <History className="h-4 w-4 text-muted-foreground" />
                      Cárdex completo
                    </Link>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-7">
          {!p ? (
            <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando producto…
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
                    {p.name}
                    {!p.is_active && (
                      <Badge tone="neutral" className="ml-2 align-middle">
                        Inactivo
                      </Badge>
                    )}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    SKU <span className="font-mono">{p.sku}</span>
                    {p.category && ` · ${p.category}`}
                    {p.brand && ` · ${p.brand}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label="Producto anterior"
                    disabled={!anterior}
                    onClick={() => anterior && onNavegar(anterior)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label="Producto siguiente"
                    disabled={!siguiente}
                    onClick={() => siguiente && onNavegar(siguiente)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 inline-flex rounded-xl bg-muted p-1">
                {(
                  [
                    ["info", "Información"],
                    ["hist", "Historial"],
                    ["notas", "Notas"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTab(k)}
                    className={cn(
                      "h-9 cursor-pointer rounded-lg px-4 text-sm font-medium transition-colors",
                      tab === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-5">
                {tab === "info" && (
                  <TabInfo
                    p={p}
                    verCostos={verCostos}
                    puedeGestionar={puedeGestionar}
                    onAjustar={() => setAjustando(true)}
                    onUbicacion={onNavegar}
                    onMinimo={(min) => setP({ ...p, stock_minimo: min })}
                  />
                )}
                {tab === "hist" && (
                  <TabHistorial key={p.quantity} productId={p.id} existencia={p.quantity} verCostos={verCostos} />
                )}
                {tab === "notas" && <TabNotas productId={p.id} />}
              </div>
            </>
          )}
        </div>
        {p && ajustando && (
          <AjusteStock
            producto={p}
            onClose={() => setAjustando(false)}
            onAjustado={(cantidad) => {
              setP((prev) => (prev && prev.id === p.id
                  ? { ...prev, quantity: cantidad, ubicaciones: prev.ubicaciones.map((u) => (u.actual ? { ...u, quantity: cantidad } : u)) }
                  : prev));
              router.refresh();
            }}
          />
        )}
      </aside>
    </div>
  );
}

function MenuItem({
  icon: Icon,
  onClick,
  children,
}: {
  icon: typeof Camera;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-sm hover:bg-muted"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      {children}
    </button>
  );
}

// ------------------------------------------------------------ Información
function TabInfo({
  p,
  verCostos,
  puedeGestionar,
  onAjustar,
  onUbicacion,
  onMinimo,
}: {
  p: DetalleProducto;
  verCostos: boolean;
  puedeGestionar: boolean;
  onAjustar: () => void;
  onUbicacion: (id: string) => void;
  onMinimo: (min: number | null) => void;
}) {
  const fotos = useMemo(() => [p.image_url, ...p.galeria].filter(Boolean) as string[], [p.image_url, p.galeria]);
  const [sel, setSel] = useState(0);
  useEffect(() => setSel(0), [p.id]);
  const min = p.stock_minimo ?? MINIMO_DEFAULT;
  const agotado = p.quantity <= 0;
  const bajo = !agotado && p.quantity <= min;
  const margen = verCostos && p.price_cents > 0 ? Math.round((1 - p.cost_cents / p.price_cents) * 100) : null;

  const filas: [string, React.ReactNode][] = [
    ["Inventario", [p.inventario, p.es_dropship ? "dropship" : p.sucursal].filter(Boolean).join(" · ") || "—"],
    ["Categoría", p.category ?? "—"],
    ["Marca", p.brand ?? "—"],
    ...(p.size ? ([["Tamaño", p.size]] as [string, string][]) : []),
    ...(p.color ? ([["Color", p.color]] as [string, string][]) : []),
    ["Proveedor", p.proveedor ?? "Stock propio"],
    ["Precio de venta", <span key="p" className="font-semibold tabular-nums">{formatMXN(p.price_cents)}</span>],
    ...(verCostos
      ? ([
          [
            "Costo",
            <span key="c" className="tabular-nums">
              {formatMXN(p.cost_cents)}
              {margen != null && <span className="text-muted-foreground"> · margen {margen}%</span>}
            </span>,
          ],
        ] as [string, React.ReactNode][])
      : []),
    ["Vendidas", <span key="v" className="tabular-nums">{p.ventas_30d} <span className="text-muted-foreground">en 30 días</span></span>],
    ...(p.etiqueta ? ([["Etiqueta", <Badge key="e" tone="warning">{p.etiqueta}</Badge>]] as [string, React.ReactNode][]) : []),
  ];

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0 space-y-4">
        <div className="flex gap-2">
          <div className="flex aspect-[4/3] min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40">
            {fotos[sel] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urlFoto(fotos[sel], 828)} alt={p.name} className="h-full w-full object-contain" />
            ) : (
              <Camera className="h-10 w-10 text-muted-foreground/50" />
            )}
          </div>
          {fotos.length > 1 && (
            <div className="flex w-16 shrink-0 flex-col gap-2">
              {fotos.slice(0, 5).map((f, k) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setSel(k)}
                  aria-label={`Foto ${k + 1}`}
                  className={cn(
                    "aspect-square cursor-pointer overflow-hidden rounded-lg border bg-background",
                    k === sel ? "border-brand ring-2 ring-brand/40" : "border-border",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urlFoto(f, 128)} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <dl>
          <p className="mb-1 text-[15px] font-semibold">Información</p>
          {filas.map(([k, v]) => (
            <div key={k} className="flex min-h-10 items-center gap-3 border-t border-border/70 py-1.5 text-sm">
              <dt className="w-32 shrink-0 text-muted-foreground">{k}</dt>
              <dd className="min-w-0">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* On phones stock comes first: it is what people open the product for. */}
      <div className="order-first space-y-3 md:order-none">
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">En existencia</p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span
              className={cn(
                "text-4xl font-semibold tabular-nums tracking-tight",
                agotado ? "text-red-600 dark:text-red-400" : bajo ? "text-amber-600 dark:text-amber-400" : "",
              )}
            >
              {p.quantity}
            </span>
            <span className="text-sm text-muted-foreground">{p.quantity === 1 ? "pieza" : "piezas"}</span>
          </p>
          <div className="mt-1.5">
            {agotado ? (
              <Badge tone="danger">Agotado</Badge>
            ) : bajo ? (
              <Badge tone="warning">Bajo el mínimo ({min})</Badge>
            ) : (
              <Badge tone="success">Sobre el mínimo</Badge>
            )}
          </div>
          {puedeGestionar && (
            <Button className="mt-4 h-11 w-full" onClick={onAjustar}>
              <ClipboardCheck className="h-4 w-4" />
              Ajustar stock
            </Button>
          )}
          {p.ubicaciones.length > 0 && (
            <div className="mt-4 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Dónde está</p>
              {p.ubicaciones.map((u) => (
                <button
                  key={u.product_id}
                  type="button"
                  disabled={u.actual}
                  onClick={() => onUbicacion(u.product_id)}
                  className={cn(
                    "flex min-h-9 w-full items-center gap-2 rounded-md px-1 text-left text-sm",
                    !u.actual && "cursor-pointer hover:bg-muted",
                  )}
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <span className="min-w-0 flex-1 truncate">
                    {u.inventario}
                    {u.sucursal && <span className="text-muted-foreground"> · {u.sucursal}</span>}
                  </span>
                  <span className="font-semibold tabular-nums">{u.quantity}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <PuntoReorden p={p} puedeGestionar={puedeGestionar} onMinimo={onMinimo} />
      </div>
    </div>
  );
}

function PuntoReorden({
  p,
  puedeGestionar,
  onMinimo,
}: {
  p: DetalleProducto;
  puedeGestionar: boolean;
  onMinimo: (min: number | null) => void;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [pending, start] = useTransition();
  const min = p.stock_minimo ?? MINIMO_DEFAULT;
  const semanas = p.ventas_30d > 0 ? Math.round((p.quantity / p.ventas_30d) * 4.3) : null;
  const pct = Math.min(100, Math.round((p.quantity / Math.max(1, min * 3)) * 100));

  function guardar() {
    const n = valor.trim() === "" ? null : Number(valor);
    start(async () => {
      const r = await setStockMinimo(p.id, n);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      onMinimo(n);
      setEditando(false);
      toast.success(n == null ? "Mínimo por defecto (5)" : `Mínimo: ${n} piezas`);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-semibold">Punto de reorden</p>
        {puedeGestionar && !editando && (
          <button
            type="button"
            onClick={() => {
              setValor(p.stock_minimo?.toString() ?? "");
              setEditando(true);
            }}
            className="h-8 cursor-pointer text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
          >
            Cambiar
          </button>
        )}
      </div>
      {editando ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              inputMode="numeric"
              value={valor}
              onChange={(e) => setValor(e.target.value.replace(/[^\d]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && guardar()}
              placeholder="5"
              className="h-10 w-20 rounded-lg border border-border bg-background px-3 text-base tabular-nums outline-none focus:ring-2 focus:ring-ring/30"
            />
            <span className="text-sm text-muted-foreground">piezas</span>
          </div>
          <p className="text-xs text-muted-foreground">Vacío = por defecto (5).</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={guardar} loading={pending}>
              Guardar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditando(false)} disabled={pending}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 flex items-baseline gap-1.5 text-sm text-muted-foreground">
            Mínimo <span className="text-lg font-semibold tabular-nums text-foreground">{min}</span> piezas
            {p.stock_minimo == null && <span className="text-xs">(por defecto)</span>}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-2 rounded-full",
                p.quantity <= 0 ? "bg-red-500" : p.quantity <= min ? "bg-amber-500" : "bg-emerald-500",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {p.ventas_30d > 0
              ? `Se venden ~${p.ventas_30d} al mes${
                  p.quantity > 0 ? ` · te alcanza para ~${Math.max(1, semanas ?? 1)} semanas` : " · ya debió pedirse"
                }.`
              : "Sin ventas en los últimos 30 días."}
          </p>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------ Historial
const GRUPOS: { key: string; label: string; test: (r: string) => boolean }[] = [
  { key: "ventas", label: "Ventas", test: (r) => r === "sale" || r === "return" },
  { key: "compras", label: "Compras", test: (r) => r.startsWith("purchase") },
  { key: "ajustes", label: "Ajustes", test: (r) => r === "adjustment" },
  { key: "traspasos", label: "Traspasos", test: (r) => r.startsWith("transfer") || r.startsWith("traspaso") },
];

function iconoMov(reason: string) {
  if (reason.startsWith("purchase")) return Truck;
  if (reason === "sale" || reason === "return") return ShoppingCart;
  if (reason.startsWith("transfer") || reason.startsWith("traspaso")) return ArrowLeftRight;
  return ClipboardCheck;
}

function TabHistorial({ productId, existencia, verCostos }: { productId: string; existencia: number; verCostos: boolean }) {
  const [data, setData] = useState<{ movimientos: MovimientoCardex[]; resumen: CardexResumen } | null>(null);
  const [grupo, setGrupo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setData(null);
    historialProducto(productId)
      .then((d) => vivo && setData(d))
      .catch(() => vivo && setData({ movimientos: [], resumen: { comprado: 0, vendido: 0, devuelto: 0, ajustado: 0, costoPromedioCents: null } }));
    return () => {
      vivo = false;
    };
  }, [productId]);

  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando historial…
      </div>
    );
  }

  const hace30 = Date.now() - 30 * 86400000;
  const recientes = data.movimientos.filter((m) => new Date(m.fecha).getTime() >= hace30);
  const entradas = recientes.filter((m) => m.delta > 0).reduce((s, m) => s + m.delta, 0);
  const salidas = recientes.filter((m) => m.delta < 0).reduce((s, m) => s + m.delta, 0);
  const ajustes = recientes.filter((m) => m.reason === "adjustment").length;
  const presentes = GRUPOS.filter((g) => data.movimientos.some((m) => g.test(m.reason)));
  const lista = grupo ? data.movimientos.filter((m) => GRUPOS.find((g) => g.key === grupo)!.test(m.reason)) : data.movimientos;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ["Entradas · 30 d", `+${entradas}`, "text-emerald-600 dark:text-emerald-400"],
            ["Salidas · 30 d", `${salidas === 0 ? "0" : `−${Math.abs(salidas)}`}`, "text-red-600 dark:text-red-400"],
            ["Ajustes · 30 d", String(ajustes), "text-amber-600 dark:text-amber-400"],
            ["Existencia hoy", String(existencia), ""],
          ] as const
        ).map(([k, v, c]) => (
          <div key={k} className="rounded-xl border border-border px-3 py-2.5">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className={cn("text-xl font-semibold tabular-nums", c)}>{v}</p>
          </div>
        ))}
      </div>

      {presentes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Chip activo={grupo === null} onClick={() => setGrupo(null)}>
            Todo
          </Chip>
          {presentes.map((g) => (
            <Chip key={g.key} activo={grupo === g.key} onClick={() => setGrupo(g.key)}>
              {g.label}
            </Chip>
          ))}
        </div>
      )}

      {lista.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Sin movimientos todavía.</p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border">
          {lista.map((m) => {
            const Icon = iconoMov(m.reason);
            const contenido = (
              <>
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                    m.delta > 0
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : m.reason === "adjustment"
                        ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{m.titulo}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[m.quien, fecha(m.fecha), m.detalle, verCostos && m.costo_unitario_cents != null ? `${formatMXN(m.costo_unitario_cents)} c/u` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span
                    className={cn(
                      "text-[15px] font-semibold tabular-nums",
                      m.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                    )}
                  >
                    {m.delta > 0 ? `+${m.delta}` : `−${Math.abs(m.delta)}`}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">queda {m.saldo}</span>
                </span>
              </>
            );
            return (
              <li key={m.id} className="border-t border-border/70 first:border-t-0">
                {m.href ? (
                  <Link href={m.href} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
                    {contenido}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 px-3 py-2.5">{contenido}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href={`/inventario/${productId}`}
        className="inline-flex h-10 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <History className="h-4 w-4" />
        Ver cárdex completo
      </Link>
    </div>
  );
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 cursor-pointer rounded-full border px-3.5 text-sm",
        activo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------ Notas
function TabNotas({ productId }: { productId: string }) {
  const [notas, setNotas] = useState<NotaProducto[] | null>(null);
  const [texto, setTexto] = useState("");
  const [pending, start] = useTransition();

  const cargar = useCallback(() => {
    notasProducto(productId)
      .then(setNotas)
      .catch(() => setNotas([]));
  }, [productId]);

  useEffect(() => {
    setNotas(null);
    cargar();
  }, [cargar]);

  function guardar() {
    start(async () => {
      const r = await agregarNota(productId, texto);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setTexto("");
      cargar();
    });
  }

  function borrar(id: string) {
    start(async () => {
      const r = await borrarNota(id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      cargar();
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border p-3">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Escribe una nota para el equipo sobre esta pieza…"
          className="w-full resize-none rounded-lg border border-dashed border-border bg-background p-3 text-base outline-none focus:border-solid focus:ring-2 focus:ring-ring/30 sm:text-sm"
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" className="h-9" onClick={guardar} loading={pending} disabled={!texto.trim()}>
            Guardar nota
          </Button>
        </div>
      </div>

      {notas === null ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando notas…
        </div>
      ) : notas.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Sin notas. Úsalas para lo que el equipo debe saber de esta pieza.
        </p>
      ) : (
        notas.map((n) => (
          <div key={n.id} className="flex gap-3 rounded-xl border border-border p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand-foreground">
              {n.autor.trim().charAt(0).toUpperCase() || "?"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="font-semibold">{n.autor}</span>{" "}
                <span className="text-xs text-muted-foreground">· {fecha(n.created_at)}</span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{n.texto}</p>
            </div>
            {n.mia && (
              <button
                type="button"
                onClick={() => borrar(n.id)}
                disabled={pending}
                aria-label="Borrar nota"
                className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}
