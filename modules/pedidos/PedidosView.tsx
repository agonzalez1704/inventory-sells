"use client";

import { useEffect, useMemo, useState } from "react";
import { Camera, Landmark, MapPin, Package, Search, Store, Truck } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { foto as urlFoto } from "@/lib/foto";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { PanelPedido } from "./PanelPedido";

export type ItemPedido = {
  nombre: string;
  qty: number;
  products: {
    sku?: string | null;
    image_url?: string | null;
    quantity?: number | null;
    enlace_proveedor: string | null;
    inventories: { name?: string | null; es_dropship: boolean | null; sucursales?: { nombre: string } | null } | null;
  } | null;
};

export type PedidoWeb = {
  id: string;
  folio: string;
  nombre: string;
  telefono: string;
  email: string | null;
  cp: string | null;
  estado: string | null;
  municipio: string | null;
  direccion: string | null;
  referencias: string | null;
  status: string;
  metodo: string | null;
  tipo_entrega: string;
  total_cents: number;
  envio_cents: number | null;
  envio_desc: string | null;
  created_at: string;
  paid_at: string | null;
  dropship_estado: "por_pedir" | "pidiendo" | "pedido" | null;
  dropship_ref: string | null;
  /** Hold: when the reserved pieces go back on sale (metodo 'sucursal'). */
  apartada_hasta: string | null;
  /** Branch the customer chose to collect at. */
  sucursal: string | null;
  /** Fulfillment trail. */
  preparado_at: string | null;
  listo_at: string | null;
  enviado_at: string | null;
  entregado_at: string | null;
  guia_paqueteria: string | null;
  guia_numero: string | null;
  guia_costo_cents: number | null;
  entrega_nota: string | null;
  /** Set when the order came from a quote's payment link. */
  cotizacion_folio: string | null;
  orden_web_items: ItemPedido[];
};

export const METODO_LABEL: Record<string, string> = {
  card: "Tarjeta",
  oxxo: "OXXO",
  spei: "SPEI",
  aplazo: "Aplazo",
  transferencia: "Transferencia",
  sucursal: "Paga en mostrador",
  efectivo: "Efectivo en mostrador",
  tarjeta: "Tarjeta en mostrador",
};

const P = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";
export const PILL = {
  gris: `${P} bg-muted text-muted-foreground`,
  ambar: `${P} bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300`,
  verde: `${P} bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300`,
  rojo: `${P} bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300`,
  violeta: `${P} bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300`,
  azul: `${P} bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300`,
};

export const esDrop = (i: ItemPedido) => i.products?.inventories?.es_dropship ?? false;

/** Which column an order belongs to. */
export type Etapa = "cobrar" | "preparar" | "listo" | "entregado" | "cerrado";
export function etapaDe(p: PedidoWeb): Etapa {
  if (p.status === "cancelada" || p.status === "expirada") return "cerrado";
  if (p.status !== "pagada") return "cobrar";
  if (p.entregado_at) return "entregado";
  if (p.listo_at || p.enviado_at) return "listo";
  return "preparar";
}

/** wa.me link with the message ready (Mexican numbers, 52 added when missing). */
export function waLink(telefono: string, mensaje: string) {
  const d = (telefono ?? "").replace(/\D/g, "");
  const num = d.length === 10 ? `52${d}` : d;
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
}

const TZ = "America/Mexico_City";
const hace = (iso: string) => {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
};
const horaCorta = (iso: string) => new Intl.DateTimeFormat("es-MX", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));

const COLUMNAS: { key: Etapa; titulo: string; sub: string; color: string }[] = [
  { key: "cobrar", titulo: "Por cobrar", sub: "Pago por confirmar o apartados", color: "bg-amber-500" },
  { key: "preparar", titulo: "Por preparar", sub: "Pagados: junta las piezas", color: "bg-blue-500" },
  { key: "listo", titulo: "Listo / En camino", sub: "Esperando que recojan o que llegue", color: "bg-violet-500" },
  { key: "entregado", titulo: "Entregado", sub: "Últimos 2 días", color: "bg-emerald-500" },
];

export function PedidosView({
  pedidos,
  isAdmin,
  dirTienda = null,
}: {
  pedidos: PedidoWeb[];
  isAdmin: boolean;
  /** Shop address: where the supplier ships a dropship order for pickup. */
  dirTienda?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [vista, setVista] = useState<"tablero" | "lista">("tablero");
  const [entrega, setEntrega] = useState<"todos" | "recoger" | "envio">("todos");
  const [panelId, setPanelId] = useState<string | null>(null);
  const [cerrados, setCerrados] = useState(false);

  const q = query.trim().toLowerCase();
  const filtrados = useMemo(
    () =>
      pedidos.filter((p) => {
        if (entrega !== "todos" && p.tipo_entrega !== entrega) return false;
        if (!q) return true;
        return [p.folio, p.nombre, p.telefono, ...(p.orden_web_items ?? []).map((i) => i.nombre)]
          .filter(Boolean)
          .some((t) => String(t).toLowerCase().includes(q));
      }),
    [pedidos, entrega, q],
  );
  const grupos = useMemo(() => {
    const m: Record<Etapa, PedidoWeb[]> = { cobrar: [], preparar: [], listo: [], entregado: [], cerrado: [] };
    for (const p of filtrados) m[etapaDe(p)].push(p);
    return m;
  }, [filtrados]);

  // The board's own reading order, also what ‹ › walks.
  const orden = [...grupos.cobrar, ...grupos.preparar, ...grupos.listo, ...grupos.entregado, ...(cerrados ? grupos.cerrado : [])];
  const ids = orden.map((p) => p.id);
  const i = panelId ? ids.indexOf(panelId) : -1;
  const pedidoPanel = panelId ? (pedidos.find((p) => p.id === panelId) ?? null) : null;

  // A hold's clock ticks on screen: it is the one thing that changes by itself.
  const [, setTick] = useState(0);
  useEffect(() => {
    const hayApartado = pedidos.some((p) => p.status === "pendiente" && p.apartada_hasta);
    if (!hayApartado) return;
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [pedidos]);

  return (
    <section className="space-y-5" data-ancho="completo">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Pedidos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tienda en línea y cotizaciones pagadas ·{" "}
            <b className="text-amber-700 dark:text-amber-400">{grupos.cobrar.length} por cobrar</b> ·{" "}
            <b className="text-blue-700 dark:text-blue-400">{grupos.preparar.length} por preparar</b> · {grupos.listo.length} listos
          </p>
        </div>
        <div className="inline-flex rounded-xl bg-muted p-1 text-sm">
          {(["tablero", "lista"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVista(v)}
              className={cn("h-8 cursor-pointer rounded-lg px-3 font-medium capitalize", vista === v ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full min-w-0 sm:max-w-sm sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Folio, cliente, teléfono o producto" className="h-11 pl-9 text-base sm:h-10 sm:text-sm" />
        </div>
        {(
          [
            ["todos", "Todos", null],
            ["recoger", "Recoger", Store],
            ["envio", "Envío", Truck],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            type="button"
            onClick={() => setEntrega(k)}
            className={cn(
              "inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm",
              entrega === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {label}
          </button>
        ))}
        {grupos.cerrado.length > 0 && (
          <button type="button" onClick={() => setCerrados((c) => !c)} className="ml-auto cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            {cerrados ? "Ocultar" : "Ver"} cancelados y vencidos · {grupos.cerrado.length}
          </button>
        )}
      </div>

      {pedidos.length === 0 ? (
        <EmptyState icon={Package} title="Sin pedidos todavía" description="Aquí aparecen los pedidos de la tienda en línea y los que se pagan desde una cotización." />
      ) : vista === "tablero" ? (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] lg:mx-0 lg:grid lg:grid-cols-4 lg:px-0">
          {COLUMNAS.map((c) => (
            <div key={c.key} className="flex w-[19rem] shrink-0 flex-col gap-2.5 rounded-2xl bg-muted/50 p-2.5 lg:w-auto">
              <div className="px-1.5 pt-1">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className={cn("h-2 w-2 rounded-full", c.color)} />
                  {c.titulo}
                  <span className="rounded-full bg-background px-1.5 text-xs tabular-nums text-muted-foreground">{grupos[c.key].length}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{c.sub}</p>
              </div>
              {grupos[c.key].map((p) => (
                <Tarjeta key={p.id} p={p} activa={p.id === panelId} onClick={() => setPanelId(p.id)} />
              ))}
              {grupos[c.key].length === 0 && <p className="px-1.5 pb-2 text-xs text-muted-foreground/70">Nada aquí.</p>}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {orden.map((p) => (
            <Tarjeta key={p.id} p={p} activa={p.id === panelId} onClick={() => setPanelId(p.id)} lista />
          ))}
        </div>
      )}

      {cerrados && vista === "tablero" && grupos.cerrado.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">Cancelados y vencidos</p>
          {grupos.cerrado.map((p) => (
            <Tarjeta key={p.id} p={p} activa={p.id === panelId} onClick={() => setPanelId(p.id)} lista />
          ))}
        </div>
      )}

      <PanelPedido
        pedido={pedidoPanel}
        anterior={i > 0 ? ids[i - 1] : null}
        siguiente={i >= 0 && i < ids.length - 1 ? ids[i + 1] : null}
        onNavegar={setPanelId}
        onClose={() => setPanelId(null)}
        isAdmin={isAdmin}
        dirTienda={dirTienda}
      />
    </section>
  );
}

function Tarjeta({ p, activa, onClick, lista }: { p: PedidoWeb; activa: boolean; onClick: () => void; lista?: boolean }) {
  const recoger = p.tipo_entrega === "recoger";
  const items = p.orden_web_items ?? [];
  const piezas = items.reduce((s, i) => s + i.qty, 0);
  const fotos = items.map((i) => i.products?.image_url).filter(Boolean).slice(0, 2) as string[];
  const faltan = items.some((i) => !esDrop(i) && i.products?.quantity != null && i.products.quantity < i.qty);

  // A hold is the only thing on this screen with a deadline.
  const restan = p.apartada_hasta && p.status === "pendiente" ? Math.round((Date.parse(p.apartada_hasta) - Date.now()) / 60000) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full cursor-pointer space-y-2.5 rounded-xl border bg-background p-3 text-left hover:border-ring/40",
        activa ? "border-foreground ring-1 ring-foreground" : "border-border",
        lista && "sm:flex sm:items-center sm:gap-4 sm:space-y-0",
      )}
    >
      <div className={cn("flex items-center gap-2", lista && "sm:w-52 sm:shrink-0")}>
        <span className="font-mono text-[13px] font-semibold">{p.folio}</span>
        <span className="text-xs text-muted-foreground">{hace(p.created_at)}</span>
        {!lista && <span className="flex-1" />}
        {!lista && <span className="text-[15px] font-semibold tabular-nums">{formatMXN(p.total_cents)}</span>}
      </div>

      <div className={cn("flex items-center gap-2.5", lista && "sm:min-w-0 sm:flex-1")}>
        <div className="flex shrink-0">
          {fotos.length === 0 ? (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Camera className="h-4 w-4 text-muted-foreground/50" />
            </span>
          ) : (
            fotos.map((f, k) => (
              <span key={f} className={cn("h-9 w-9 overflow-hidden rounded-lg border-2 border-background bg-muted", k > 0 && "-ml-2.5")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={urlFoto(f, 128)} alt="" className="h-full w-full object-cover" />
              </span>
            ))
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{p.nombre}</p>
          <p className="truncate text-xs text-muted-foreground">
            {piezas} {piezas === 1 ? "pieza" : "piezas"} · {p.metodo ? (METODO_LABEL[p.metodo] ?? p.metodo) : "—"}
          </p>
        </div>
        {lista && <span className="shrink-0 text-[15px] font-semibold tabular-nums">{formatMXN(p.total_cents)}</span>}
      </div>

      <div className={cn("flex flex-wrap items-center gap-1.5", lista && "sm:w-auto sm:shrink-0")}>
        <span className={PILL.gris}>
          {recoger ? <Store className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
          {recoger ? (p.sucursal ?? "Recoger") : (p.municipio ?? "Envío")}
        </span>
        {p.status === "pendiente" && p.metodo === "transferencia" && <span className={PILL.ambar}>Por confirmar</span>}
        {p.status === "cancelada" && <span className={PILL.gris}>Cancelado</span>}
        {p.status === "expirada" && <span className={PILL.gris}>Apartado vencido</span>}
        {faltan && p.status === "pagada" && !p.entregado_at && <span className={PILL.rojo}>No alcanza el stock</span>}
        {p.dropship_estado === "por_pedir" || p.dropship_estado === "pidiendo" ? <span className={PILL.ambar}>Pedir al proveedor</span> : null}
        {p.cotizacion_folio && <span className={PILL.violeta}>{p.cotizacion_folio}</span>}
        {p.guia_numero && (
          <span className={PILL.violeta}>
            <Truck className="h-3 w-3" />
            {p.guia_paqueteria}
          </span>
        )}
        {p.listo_at && !p.entregado_at && recoger && <span className={PILL.violeta}>Listo desde {horaCorta(p.listo_at)}</span>}
        {p.entregado_at && (
          <span className={PILL.verde}>
            <MapPin className="h-3 w-3" />
            {recoger ? "Recogido" : "Entregado"}
          </span>
        )}
        {p.metodo === "transferencia" && p.status === "pagada" && !p.entregado_at && (
          <span className={PILL.azul}>
            <Landmark className="h-3 w-3" />
            Pagado
          </span>
        )}
      </div>

      {restan != null && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            {restan > 0 ? `Apartado · vence en ${restan < 60 ? `${restan} min` : `${Math.round(restan / 60)} h`}` : "Apartado vencido: por liberar"}
          </p>
          <div className="h-1 overflow-hidden rounded-full bg-amber-100 dark:bg-amber-950">
            <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(2, Math.min(100, (restan / 180) * 100))}%` }} />
          </div>
        </div>
      )}
    </button>
  );
}
