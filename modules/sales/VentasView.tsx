"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, ChevronRight, Loader2, Receipt, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { foto as urlFoto } from "@/lib/foto";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Hoja } from "@/components/ui/drawer";
import { CuentaChip } from "@/components/ui/cuenta";
import { GarantiaModal } from "@/modules/garantias/GarantiaModal";
import type { PickerCustomer } from "@/modules/customers/CustomerPicker";
import { EditModal, type SaleWithItems } from "./RecentSales";
import { PanelVenta, MetodoPill } from "./PanelVenta";
import { buscarVentas } from "./actions";

export type VentaLista = Omit<SaleWithItems, "sale_items"> & {
  sale_items: (SaleWithItems["sale_items"][number] & { products: { name: string; sku: string; image_url?: string | null } | null })[];
};

export const METODO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  otro: "Otro",
  mixto: "Mixto",
  saldo: "Saldo",
};

export type ResumenVentas = {
  count: number;
  totalCents: number;
  porMetodo: Record<string, { n: number; totalCents: number }>;
  fiados: number;
};

type Filtros = { from: string; to: string; metodo: string | null; canal: string | null; solo: string | null };

const TZ = "America/Mexico_City";
const diaMX = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
const diaTitulo = (f: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${f}T12:00:00Z`));
const hora = (iso: string) => new Intl.DateTimeFormat("es-MX", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const rango = (f: string, t: string) => {
  const fmt = (d: string) => new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", day: "numeric", month: "short" }).format(new Date(`${d}T12:00:00Z`));
  return f === t ? fmt(f) : `${fmt(f)} – ${fmt(t)}`;
};
const mas = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

export function VentasView({
  ventas,
  resumen,
  filtros,
  hoy,
  customers,
  isAdmin,
  abrirId,
}: {
  ventas: VentaLista[];
  resumen: ResumenVentas;
  filtros: Filtros;
  hoy: string;
  customers: PickerCustomer[];
  isAdmin: boolean;
  abrirId: string | null;
}) {
  const router = useRouter();
  const [navegando, start] = useTransition();
  const [panelId, setPanelId] = useState<string | null>(abrirId);
  const [corregir, setCorregir] = useState<VentaLista | null>(null);
  const [garantia, setGarantia] = useState<VentaLista | null>(null);
  const [garantiaBuscar, setGarantiaBuscar] = useState(false);
  const [filtrosOpen, setFiltrosOpen] = useState(false);
  const [desde, setDesde] = useState(filtros.from);
  const [hasta, setHasta] = useState(filtros.to);
  useEffect(() => {
    setDesde(filtros.from);
    setHasta(filtros.to);
  }, [filtros.from, filtros.to]);
  useEffect(() => {
    if (abrirId) setPanelId(abrirId);
  }, [abrirId]);

  // Search across every sale (not only this period).
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<VentaLista[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResultados(null);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        setResultados((await buscarVentas(q)) as VentaLista[]);
      } catch {
        setResultados([]);
      } finally {
        setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const lista = resultados ?? ventas;
  const grupos = useMemo(() => {
    const m = new Map<string, VentaLista[]>();
    for (const v of lista) {
      const d = diaMX(v.settled_at ?? v.created_at);
      m.set(d, [...(m.get(d) ?? []), v]);
    }
    return [...m.entries()];
  }, [lista]);
  const ids = lista.map((v) => v.id);
  const iPanel = panelId ? ids.indexOf(panelId) : -1;
  const ventaPanel = panelId ? (lista.find((v) => v.id === panelId) ?? null) : null;

  function ir(p: Partial<Filtros>) {
    const f = { ...filtros, ...p };
    const sp = new URLSearchParams({ from: f.from, to: f.to });
    if (f.metodo) sp.set("metodo", f.metodo);
    if (f.canal) sp.set("canal", f.canal);
    if (f.solo) sp.set("solo", f.solo);
    start(() => router.push(`/ventas?${sp}`));
  }

  const presets: [string, string, string][] = [
    ["Hoy", hoy, hoy],
    ["Ayer", mas(hoy, -1), mas(hoy, -1)],
    ["7 días", mas(hoy, -6), hoy],
    ["Este mes", `${hoy.slice(0, 7)}-01`, hoy],
  ];
  const presetActivo = presets.find(([, f, t]) => f === filtros.from && t === filtros.to)?.[0] ?? null;
  const hayFiltros = !!(filtros.metodo || filtros.canal || filtros.solo);

  const panelFiltros = (
    <div className="space-y-6">
      <div>
        <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Periodo</p>
        {presets.map(([label, f, t]) => (
          <button
            key={label}
            type="button"
            onClick={() => ir({ from: f, to: t })}
            className={cn(
              "flex h-9 w-full cursor-pointer items-center rounded-lg px-2.5 text-left text-sm",
              presetActivo === label ? "bg-brand-soft font-semibold text-brand-foreground" : "hover:bg-muted",
            )}
          >
            {label}
          </button>
        ))}
        <div className="mt-2 grid gap-1.5 px-1">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-10">Desde</span>
            <Input type="date" value={desde} max={hoy} onChange={(e) => setDesde(e.target.value)} className="h-9 min-w-0 flex-1 px-2 text-sm" />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-10">Hasta</span>
            <Input type="date" value={hasta} max={hoy} onChange={(e) => setHasta(e.target.value)} className="h-9 min-w-0 flex-1 px-2 text-sm" />
          </label>
        </div>
        {(desde !== filtros.from || hasta !== filtros.to) && desde && hasta && (
          <Button size="sm" className="mx-1 mt-2" onClick={() => ir({ from: desde <= hasta ? desde : hasta, to: desde <= hasta ? hasta : desde })}>
            Aplicar fechas
          </Button>
        )}
      </div>

      <div>
        <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Método de pago</p>
        <div className="space-y-1.5 px-1">
          <Opcion activa={!filtros.metodo} onClick={() => ir({ metodo: null })} label="Todos" valor={String(resumen.count)} />
          {Object.entries(resumen.porMetodo)
            .sort((a, b) => b[1].totalCents - a[1].totalCents)
            .map(([m, r]) => (
              <Opcion
                key={m}
                activa={filtros.metodo === m}
                onClick={() => ir({ metodo: filtros.metodo === m ? null : m })}
                label={METODO_LABEL[m] ?? m}
                valor={`${r.n} · ${formatMXN(r.totalCents).replace(/\.00$/, "")}`}
              />
            ))}
        </div>
      </div>

      <div className="px-1">
        <p className="px-1.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Canal</p>
        <div className="grid grid-cols-3 rounded-xl bg-muted p-1 text-sm">
          {([
            [null, "Todos"],
            ["mostrador", "Mostrador"],
            ["online", "En línea"],
          ] as const).map(([k, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => ir({ canal: k })}
              className={cn("h-8 cursor-pointer whitespace-nowrap rounded-lg px-1 text-[13px] font-medium", filtros.canal === k ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-1">
        <p className="px-1.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Solo</p>
        <Opcion activa={filtros.solo === "fiados"} onClick={() => ir({ solo: filtros.solo === "fiados" ? null : "fiados" })} label="Fiados cobrados" valor={String(resumen.fiados)} />
      </div>
    </div>
  );

  return (
    <section className="space-y-5" data-ancho="completo">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {resumen.count} {resumen.count === 1 ? "venta" : "ventas"} · <span className="font-semibold tabular-nums text-foreground">{formatMXN(resumen.totalCents)}</span> ·{" "}
            {presetActivo ?? rango(filtros.from, filtros.to)}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setGarantiaBuscar(true)} aria-label="Garantía" className="h-11 w-11 px-0 sm:h-10 sm:w-auto sm:px-4">
          <ShieldCheck className="h-4 w-4" />
          <span className="hidden sm:inline">Garantía</span>
        </Button>
      </div>

      <div className="space-y-3">
        <div className="relative max-w-2xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          {buscando && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Busca por cliente, producto, SKU, vendedor o total…" className="h-11 pl-9 text-base sm:text-sm" />
        </div>

        {/* Phone: period and the common filters one tap away. */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setFiltrosOpen(true)}
            className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {presetActivo ?? rango(filtros.from, filtros.to)}
            {hayFiltros && <span className="rounded-full bg-brand px-1.5 text-xs text-brand-foreground">•</span>}
          </button>
          {Object.entries(resumen.porMetodo).map(([m, r]) => (
            <button
              key={m}
              type="button"
              onClick={() => ir({ metodo: filtros.metodo === m ? null : m })}
              className={cn(
                "inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-sm",
                filtros.metodo === m ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
              )}
            >
              {METODO_LABEL[m] ?? m} <b className="tabular-nums">{r.n}</b>
            </button>
          ))}
          {resumen.fiados > 0 && (
            <button
              type="button"
              onClick={() => ir({ solo: filtros.solo === "fiados" ? null : "fiados" })}
              className={cn(
                "inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-sm",
                filtros.solo === "fiados" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background",
              )}
            >
              Fiados cobrados
            </button>
          )}
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6">
        <aside className="hidden lg:sticky lg:top-4 lg:block lg:self-start">{panelFiltros}</aside>

        <div className={cn("transition-opacity", (navegando || buscando) && "opacity-60")}>
          {resultados && <p className="mb-2 text-sm text-muted-foreground">Resultados en todas las ventas</p>}
          {lista.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={resultados ? "Sin resultados" : "Sin ventas"}
              description={resultados ? `Nada coincide con “${query.trim()}”.` : hayFiltros ? "Nada coincide con estos filtros." : "No hay ventas en este periodo."}
            />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border bg-background">
              <div className="hidden h-10 items-center gap-4 border-b border-border bg-muted/40 px-5 text-xs font-medium text-muted-foreground lg:flex">
                <span className="w-20">Hora</span>
                <span className="flex-1">Producto · cliente</span>
                <span className="hidden w-32 xl:block">Vendedor</span>
                <span className="w-56">Pago</span>
                <span className="w-24 text-right">Total</span>
                <span className="w-4" />
              </div>
              {grupos.map(([dia, vs]) => (
                <div key={dia}>
                  <div className="flex h-10 items-center border-b border-border/70 bg-muted/40 px-4 text-sm lg:px-5">
                    <span className="font-semibold first-letter:uppercase">{dia === hoy ? "Hoy" : diaTitulo(dia)}</span>
                    <span className="flex-1" />
                    <span className="text-muted-foreground">
                      {vs.length} {vs.length === 1 ? "venta" : "ventas"} · <span className="font-semibold tabular-nums text-foreground">{formatMXN(vs.reduce((s, v) => s + v.total_cents, 0))}</span>
                    </span>
                  </div>
                  {vs.map((v) => (
                    <FilaVenta key={v.id} v={v} activa={v.id === panelId} onClick={() => setPanelId(v.id)} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Hoja open={filtrosOpen} onClose={() => setFiltrosOpen(false)} title="Filtros">
        <div className="pb-2">{panelFiltros}</div>
        <Button className="mt-4 h-12 w-full" onClick={() => setFiltrosOpen(false)}>
          Ver {resumen.count} {resumen.count === 1 ? "venta" : "ventas"}
        </Button>
      </Hoja>

      <PanelVenta
        venta={ventaPanel}
        anterior={iPanel > 0 ? ids[iPanel - 1] : null}
        siguiente={iPanel >= 0 && iPanel < ids.length - 1 ? ids[iPanel + 1] : null}
        onNavegar={setPanelId}
        onClose={() => setPanelId(null)}
        isAdmin={isAdmin}
        bloqueado={corregir != null || garantia != null}
        onCorregir={setCorregir}
        onGarantia={setGarantia}
      />

      {corregir && <EditModal sale={corregir as SaleWithItems} customers={customers} onClose={() => setCorregir(null)} />}
      {garantia && <GarantiaModal sale={garantia as SaleWithItems} onClose={() => setGarantia(null)} />}
      {garantiaBuscar && <GarantiaModal onClose={() => setGarantiaBuscar(false)} />}
    </section>
  );
}

function Opcion({ activa, onClick, label, valor }: { activa: boolean; onClick: () => void; label: string; valor: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-full border px-3.5 text-sm",
        activa ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
      )}
    >
      <span>{label}</span>
      <span className={cn("tabular-nums", activa ? "opacity-80" : "text-muted-foreground")}>{valor}</span>
    </button>
  );
}

function FilaVenta({ v, activa, onClick }: { v: VentaLista; activa: boolean; onClick: () => void }) {
  const primero = v.sale_items[0];
  const mas = v.sale_items.length - 1;
  const img = v.sale_items.find((i) => i.products?.image_url)?.products?.image_url ?? null;
  const cliente = v.customer_name?.trim() || "Mostrador";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 border-b border-border/70 px-4 py-2.5 text-left last:border-0 hover:bg-muted/40 lg:gap-4 lg:px-5",
        activa && "bg-brand-soft/60 shadow-[inset_3px_0_0_hsl(var(--brand))]",
      )}
    >
      <span className="hidden w-20 shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground lg:block">{hora(v.settled_at ?? v.created_at)}</span>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted lg:h-10 lg:w-10">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urlFoto(img, 128)} alt="" className="h-full w-full object-cover" />
          ) : (
            <Camera className="h-4 w-4 text-muted-foreground/50" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold lg:text-sm">
            {primero?.products?.name ?? "Sin productos"}
            {mas > 0 && <span className="font-medium text-muted-foreground"> +{mas}</span>}
          </p>
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="lg:hidden">{hora(v.settled_at ?? v.created_at)} ·</span>
            <span className="truncate">{cliente}</span>
            {v.settled_at && <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-px text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Fiado cobrado</span>}
          </p>
          <div className="mt-1 flex gap-1.5 lg:hidden">
            <MetodoPill metodo={v.payment_method} />
          </div>
        </div>
      </div>
      <span className="hidden w-32 truncate text-sm text-muted-foreground xl:block">{v.vendedor ?? "—"}</span>
      <span className="hidden w-56 items-center gap-1.5 whitespace-nowrap lg:flex [&_*]:whitespace-nowrap">
        <MetodoPill metodo={v.payment_method} />
        {v.cuenta && <CuentaChip cuenta={v.cuenta} />}
      </span>
      <span className="w-auto shrink-0 text-right text-base font-semibold tabular-nums lg:w-24 lg:text-[15px]">{formatMXN(v.total_cents)}</span>
      <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground lg:block" />
    </button>
  );
}
