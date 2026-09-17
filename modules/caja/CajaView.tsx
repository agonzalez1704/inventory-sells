"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Coins,
  Landmark,
  MapPin,
  Plus,
  Printer,
  Scale,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Undo2,
  Usb,
  Wallet,
  X,
} from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PaymentMethod, PaymentMethodStored } from "@/lib/types";
import { imprimirCorteNavegador, type CorteData } from "@/lib/corte";
import { imprimirCorteUSB, webUsbDisponible } from "@/lib/escpos-usb";
import { BancoIcon } from "@/components/ui/cuenta";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/use-confirm";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/components/use-is-mobile";
import { registrarGasto, eliminarGasto, registrarIngreso, eliminarIngreso } from "./actions";

const METODOS: [PaymentMethod, string][] = [
  ["efectivo", "Efectivo"],
  ["tarjeta", "Tarjeta"],
  ["transferencia", "Transferencia"],
  ["otro", "Otro"],
];
// "mixto" is display-only: it labels a split sale but is never an option
// you pick, so it stays out of METODOS.
const LABEL = { ...Object.fromEntries(METODOS), mixto: "Mixto" } as Record<string, string>;

export type Gasto = {
  id: string;
  concepto: string;
  monto_cents: number;
  metodo: PaymentMethod;
  categoria: string | null;
  created_at: string;
};
export type Ingreso = Gasto;
export type Devolucion = {
  id: string;
  monto_cents: number;
  metodo: PaymentMethod;
  motivo: string | null;
  created_at: string;
};
// One cash-in event feeding the Ingresos KPI. The four `tipo`s are the KPI's
// four sources, so summing every line's monto_cents === ingresosTotal.
export type IngresoLinea = {
  id: string;
  tipo: "venta" | "abono" | "adelanto" | "extra";
  concepto: string;
  monto_cents: number;
  metodo: PaymentMethodStored | null;
  fecha: string;
};

export type CajaData = {
  from: string;
  to: string;
  /** Today in Mexico City: the period presets are computed from it. */
  hoy: string;
  /** Categories already used, most recent first, for the register panel. */
  categorias: { gasto: string[]; ingreso: string[] };
  isAdmin: boolean;
  ventasCount: number;
  ingresosPorMetodo: Record<PaymentMethod, number>;
  adelantosPorMetodo: Record<PaymentMethod, number>; // subset of ingresos
  gastosPorMetodo: Record<PaymentMethod, number>;
  devolucionesPorMetodo: Record<PaymentMethod, number>;
  ingresosTotal: number;
  gastosTotal: number;
  devolucionesTotal: number;
  gastos: Gasto[];
  ingresos: Ingreso[];
  devoluciones: Devolucion[];
  etiquetado: {
    tag: string;
    monto: number;
    productos: { nombre: string; sku: string; qty: number; monto: number }[];
  }[];
  ganancia: number | null; // net sales profit; null for non-admins
  ingresosDetalle: IngresoLinea[]; // every cash-in event; sums to ingresosTotal
  porInventario: InvAgg[];
  /** Transfer income split by receiving business account (via comprobantes). */
  porCuenta: PorCuenta[];
  /** Active branches; empty for shops without sucursales (UI stays as-is). */
  sucursales: { id: string; nombre: string }[];
  /** Branch this corte is scoped to; null = global; "sin" = unattributed. */
  sucursalSel: string | null;
  /** Global-view summary: income attributed to each branch. */
  porSucursal: { id: string; nombre: string; ingresos: number }[];
};

export type PorCuenta = {
  cuenta: { id: string; banco: string; alias: string } | null;
  monto: number;
};

export type InvMov = {
  fecha: string;
  producto: string;
  sku: string;
  qty: number;
  costoCents: number;
  precioCents: number;
};
export type InvAgg = {
  inventoryId: string;
  nombre: string;
  unidades: number;
  ventaCents: number;
  gananciaCents: number;
  movimientos: InvMov[];
};

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
  onClick,
  href,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "in" | "out" | "caja";
  onClick?: () => void;
  href?: string;
}) {
  const cuerpo = (
    <>
      <span className={cn("flex items-center gap-2 text-sm", tone === "caja" ? "font-semibold text-brand-foreground" : "text-muted-foreground")}>
        <Icon className="h-4 w-4" />
        {label}
        {(onClick || href) && <ChevronRight className="ml-auto h-4 w-4 opacity-60" />}
      </span>
      <span
        className={cn(
          "mt-1.5 block text-2xl font-semibold tabular-nums tracking-tight sm:text-[28px]",
          tone === "in" && "text-emerald-700 dark:text-emerald-400",
          tone === "out" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </span>
      {sub && <span className={cn("mt-0.5 block truncate text-xs", tone === "caja" ? "text-brand-foreground/80" : "text-muted-foreground")}>{sub}</span>}
      {href && <span className="mt-1 block text-xs font-semibold text-brand-foreground">Ver cuadre del día →</span>}
    </>
  );
  const clase = cn(
    "block rounded-2xl border p-4 text-left",
    tone === "caja" ? "border-brand/40 bg-brand-soft" : "border-border bg-background",
    (onClick || href) && "cursor-pointer transition-colors hover:border-ring/40",
  );
  if (href)
    return (
      <Link href={href} className={clase}>
        {cuerpo}
      </Link>
    );
  return onClick ? (
    <button type="button" onClick={onClick} className={clase}>
      {cuerpo}
    </button>
  ) : (
    <div className={clase}>{cuerpo}</div>
  );
}

const masDias = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

export function CajaView({ data }: { data: CajaData }) {
  const router = useRouter();
  const [navegando, startNav] = useTransition();
  const [from, setFrom] = useState(data.from);
  const [to, setTo] = useState(data.to);
  const [mov, setMov] = useState<"gasto" | "ingreso" | null>(null);
  const [ventasOpen, setVentasOpen] = useState(false);
  const [invSel, setInvSel] = useState<InvAgg | null>(null);
  const [usbOk, setUsbOk] = useState(false);
  const [usbBusy, setUsbBusy] = useState(false);
  const [filtroMov, setFiltroMov] = useState<"todo" | "gasto" | "ingreso" | "devolucion">("todo");

  useEffect(() => {
    setUsbOk(webUsbDisponible());
  }, []);
  useEffect(() => {
    setFrom(data.from);
    setTo(data.to);
  }, [data.from, data.to]);

  function go(f: string, t: string, sucursal: string | null = data.sucursalSel) {
    startNav(() => router.push(`/caja?from=${f}&to=${t}${sucursal ? `&sucursal=${sucursal}` : ""}`));
  }
  const presets: [string, string, string][] = [
    ["Hoy", data.hoy, data.hoy],
    ["Ayer", masDias(data.hoy, -1), masDias(data.hoy, -1)],
    ["7 días", masDias(data.hoy, -6), data.hoy],
    ["Mes", `${data.hoy.slice(0, 7)}-01`, data.hoy],
  ];
  const presetActivo = presets.find(([, f, t]) => f === data.from && t === data.to)?.[0] ?? null;

  const balance = data.ingresosTotal - data.gastosTotal - data.devolucionesTotal;
  const efectivoCaja =
    (data.ingresosPorMetodo.efectivo ?? 0) - (data.gastosPorMetodo.efectivo ?? 0) - (data.devolucionesPorMetodo.efectivo ?? 0);
  const sucursalNombre =
    data.sucursalSel === "sin" ? "Sin sucursal" : (data.sucursales.find((su) => su.id === data.sucursalSel)?.nombre ?? null);
  const rangoLabel = (data.from === data.to ? data.from : `${data.from} → ${data.to}`) + (sucursalNombre ? ` · ${sucursalNombre}` : " · Global");

  function buildCorte(): CorteData {
    const lineas = METODOS.map(([m, label]) => ({
      label,
      ingresos: data.ingresosPorMetodo[m] ?? 0,
      gastos: data.gastosPorMetodo[m] ?? 0,
    })).filter((l) => l.ingresos || l.gastos);
    return {
      rango: rangoLabel,
      generadoEn: new Date().toISOString(),
      lineas,
      ingresosTotal: data.ingresosTotal,
      gastosTotal: data.gastosTotal,
      devolucionesTotal: data.devolucionesTotal,
      balance,
      efectivoCaja,
      ventasCount: data.ventasCount,
      gastosCount: data.gastos.length,
      devolucionesCount: data.devoluciones.length,
      etiquetado: data.etiquetado,
      ganancia: data.ganancia,
    };
  }

  function imprimirUSB() {
    setUsbBusy(true);
    imprimirCorteUSB(buildCorte())
      .then(() => toast.success("Corte enviado a la impresora"))
      .catch((e) => toast.error(e instanceof Error ? e.message : "No se pudo imprimir por USB"))
      .finally(() => setUsbBusy(false));
  }

  // Gastos, ingresos extra and returns as one list, newest first.
  const movimientos = [
    ...data.gastos.map((m) => ({ tipo: "gasto" as const, id: m.id, concepto: m.concepto, detalle: m.categoria, metodo: m.metodo, monto: -m.monto_cents, fecha: m.created_at })),
    ...data.ingresos.map((m) => ({ tipo: "ingreso" as const, id: m.id, concepto: m.concepto, detalle: m.categoria, metodo: m.metodo, monto: m.monto_cents, fecha: m.created_at })),
    ...data.devoluciones.map((d) => ({ tipo: "devolucion" as const, id: d.id, concepto: d.motivo || "Devolución", detalle: null, metodo: d.metodo, monto: -d.monto_cents, fecha: d.created_at })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const cuenta = { todo: movimientos.length, gasto: data.gastos.length, ingreso: data.ingresos.length, devolucion: data.devoluciones.length };
  const movsVisibles = filtroMov === "todo" ? movimientos : movimientos.filter((m) => m.tipo === filtroMov);
  const maxInv = Math.max(1, ...data.porInventario.map((i) => i.ventaCents));
  const unDia = data.from === data.to;

  return (
    <section className={cn("space-y-5 transition-opacity", navegando && "opacity-60")} data-ancho="completo">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Corte de caja</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rangoLabel} · {data.ventasCount} ventas · {data.ingresos.length} ingresos extra · {data.gastos.length} gastos
            {data.devoluciones.length > 0 && ` · ${data.devoluciones.length} devoluciones`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-border bg-background">
            <button
              type="button"
              onClick={() => imprimirCorteNavegador(buildCorte())}
              className="inline-flex h-10 cursor-pointer items-center gap-2 px-3 text-sm font-medium hover:bg-muted"
              aria-label="Imprimir corte"
            >
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">Imprimir corte</span>
            </button>
            {usbOk && (
              <button
                type="button"
                onClick={imprimirUSB}
                disabled={usbBusy}
                title="Impresión directa por USB (ESC/POS)"
                aria-label="Imprimir por USB"
                className="inline-flex h-10 w-10 cursor-pointer items-center justify-center border-l border-border hover:bg-muted disabled:opacity-50"
              >
                <Usb className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button variant="secondary" onClick={() => setMov("ingreso")} className="h-10">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <span className="hidden sm:inline">Ingreso extra</span>
          </Button>
          <Button onClick={() => setMov("gasto")} className="h-10">
            <Plus className="h-4 w-4" />
            Registrar gasto
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-muted p-1">
          {presets.map(([label, f, t]) => (
            <button
              key={label}
              type="button"
              onClick={() => go(f, t)}
              className={cn(
                "h-8 cursor-pointer rounded-lg px-3 text-sm font-medium",
                presetActivo === label ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-10 w-[9.5rem] px-2 text-sm" aria-label="Desde" />
          <span className="text-muted-foreground">–</span>
          <Input type="date" value={to} min={from} max={data.hoy} onChange={(e) => setTo(e.target.value)} className="h-10 w-[9.5rem] px-2 text-sm" aria-label="Hasta" />
          {(from !== data.from || to !== data.to) && (
            <Button variant="brand" className="h-10" onClick={() => go(from, to)}>
              Aplicar
            </Button>
          )}
        </div>
        {data.sucursales.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 lg:ml-auto">
            {[{ id: null as string | null, nombre: "Global" }]
              .concat(data.sucursales)
              .concat([{ id: "sin", nombre: "Sin sucursal" }])
              .map((su) => (
                <button
                  key={su.id ?? "global"}
                  type="button"
                  onClick={() => go(data.from, data.to, su.id)}
                  className={cn(
                    "inline-flex h-9 cursor-pointer items-center gap-1 rounded-full border px-3.5 text-sm",
                    data.sucursalSel === su.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                  )}
                >
                  {su.id && su.id !== "sin" && <MapPin className="h-3.5 w-3.5" />}
                  {su.nombre}
                </button>
              ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={TrendingUp}
          label="Ingresos"
          value={formatMXN(data.ingresosTotal)}
          sub={`${data.ventasCount} ventas · ${data.ingresos.length} ingresos extra`}
          tone="in"
          onClick={data.ingresosDetalle.length > 0 ? () => setVentasOpen(true) : undefined}
        />
        <Kpi
          icon={TrendingDown}
          label="Gastos"
          value={`−${formatMXN(data.gastosTotal + data.devolucionesTotal)}`}
          sub={`${data.gastos.length} gastos · ${data.devoluciones.length} devoluciones`}
          tone="out"
        />
        <Kpi icon={Scale} label="Balance" value={formatMXN(balance)} sub="Ingresos − gastos − devoluciones" />
        <Kpi
          icon={Wallet}
          label="Efectivo en caja"
          value={formatMXN(efectivoCaja)}
          sub="Lo que debe haber en el cajón"
          tone="caja"
          href={unDia ? `/caja/cuadre?dia=${data.from}${data.sucursalSel && data.sucursalSel !== "sin" ? `&sucursal=${data.sucursalSel}` : ""}` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          <Seccion titulo="Por método de pago" sub="Neto = ingresos − gastos − devoluciones">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-y border-border/70 bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Método</th>
                    <th className="px-3 py-2 text-right font-medium">Ingresos</th>
                    <th className="px-3 py-2 text-right font-medium" title="Abonos a adelantos, ya incluidos en Ingresos">Adelantos</th>
                    <th className="px-3 py-2 text-right font-medium">Gastos</th>
                    <th className="px-3 py-2 text-right font-medium">Devol.</th>
                    <th className="px-4 py-2 text-right font-semibold text-foreground">Neto</th>
                  </tr>
                </thead>
                <tbody>
                  {METODOS.map(([m, label]) => {
                    const ing = data.ingresosPorMetodo[m] ?? 0;
                    const adel = data.adelantosPorMetodo[m] ?? 0;
                    const gas = data.gastosPorMetodo[m] ?? 0;
                    const dev = data.devolucionesPorMetodo[m] ?? 0;
                    if (ing === 0 && gas === 0 && dev === 0) return null;
                    return (
                      <tr key={m} className="border-b border-border/60 tabular-nums">
                        <td className="px-4 py-3 font-medium">{label}</td>
                        <td className="px-3 py-3 text-right text-emerald-700 dark:text-emerald-400">{ing ? formatMXN(ing) : "—"}</td>
                        <td className="px-3 py-3 text-right text-muted-foreground">{adel ? formatMXN(adel) : "—"}</td>
                        <td className={cn("px-3 py-3 text-right", gas ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>{gas ? `−${formatMXN(gas)}` : "—"}</td>
                        <td className={cn("px-3 py-3 text-right", dev ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>{dev ? `−${formatMXN(dev)}` : "—"}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatMXN(ing - gas - dev)}</td>
                      </tr>
                    );
                  })}
                  {data.ingresosTotal === 0 && data.gastosTotal === 0 && data.devolucionesTotal === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Sin movimientos en este rango.
                      </td>
                    </tr>
                  )}
                </tbody>
                {(data.ingresosTotal > 0 || data.gastosTotal > 0 || data.devolucionesTotal > 0) && (
                  <tfoot>
                    <tr className="bg-muted/40 font-semibold tabular-nums">
                      <td className="px-4 py-3">Total</td>
                      <td className="px-3 py-3 text-right">{formatMXN(data.ingresosTotal)}</td>
                      <td />
                      <td className="px-3 py-3 text-right text-red-600 dark:text-red-400">{data.gastosTotal ? `−${formatMXN(data.gastosTotal)}` : "—"}</td>
                      <td className="px-3 py-3 text-right text-red-600 dark:text-red-400">{data.devolucionesTotal ? `−${formatMXN(data.devolucionesTotal)}` : "—"}</td>
                      <td className="px-4 py-3 text-right">{formatMXN(balance)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Seccion>

          {data.porInventario.length > 0 && (
            <Seccion titulo="Corte por inventario" sub={`Venta${data.isAdmin ? " y ganancia" : ""} de las ventas del periodo. Sin ingresos extra ni gastos.`}>
              <ul>
                {data.porInventario.map((inv) => (
                  <li key={inv.inventoryId}>
                    <button
                      type="button"
                      onClick={() => setInvSel(inv)}
                      className="flex w-full cursor-pointer items-center gap-3 border-t border-border/70 px-4 py-3 text-left hover:bg-muted/40"
                    >
                      <div className="w-36 min-w-0 shrink-0 sm:w-44">
                        <p className="truncate text-sm font-semibold">{inv.nombre}</p>
                        <p className="text-xs tabular-nums text-muted-foreground">
                          {inv.unidades} {inv.unidades === 1 ? "unidad" : "unidades"}
                        </p>
                      </div>
                      <div className="hidden h-2 flex-1 overflow-hidden rounded-full bg-muted sm:block">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, (inv.ventaCents / maxInv) * 100)}%` }} />
                      </div>
                      <div className="ml-auto text-right tabular-nums sm:ml-0">
                        <p className="text-sm font-semibold">{formatMXN(inv.ventaCents)}</p>
                        {data.isAdmin && <p className="text-xs text-emerald-700 dark:text-emerald-400">+{formatMXN(inv.gananciaCents)}</p>}
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2.5 text-sm font-semibold tabular-nums">
                <span>Total</span>
                <span className="text-right">
                  {formatMXN(data.porInventario.reduce((s, i) => s + i.ventaCents, 0))}
                  {data.isAdmin && (
                    <span className="ml-3 text-emerald-700 dark:text-emerald-400">
                      +{formatMXN(data.porInventario.reduce((s, i) => s + i.gananciaCents, 0))}
                    </span>
                  )}
                </span>
              </div>
            </Seccion>
          )}

          <Seccion
            titulo="Movimientos del periodo"
            extra={
              <Button variant="ghost" size="sm" onClick={() => setMov("gasto")}>
                <Plus className="h-4 w-4" /> Gasto
              </Button>
            }
          >
            <div className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
              {(
                [
                  ["todo", "Todo"],
                  ["gasto", "Gastos"],
                  ["ingreso", "Ingresos extra"],
                  ["devolucion", "Devoluciones"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  disabled={cuenta[k] === 0 && k !== "todo"}
                  onClick={() => setFiltroMov(k)}
                  className={cn(
                    "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm disabled:cursor-default disabled:opacity-40",
                    filtroMov === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                  )}
                >
                  {label} <span className="tabular-nums opacity-70">{cuenta[k]}</span>
                </button>
              ))}
            </div>
            {movsVisibles.length === 0 ? (
              <div className="border-t border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                Sin movimientos. Registra renta, proveedores o servicios para que el corte cuadre.
              </div>
            ) : (
              <ul>
                {movsVisibles.map((m) => (
                  <MovRow key={`${m.tipo}-${m.id}`} m={m} isAdmin={data.isAdmin} />
                ))}
              </ul>
            )}
          </Seccion>
        </div>

        <div className="space-y-4">
          {data.ganancia !== null && (
            <div className="rounded-2xl border border-border bg-background p-4">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Coins className="h-4 w-4" /> Ganancia neta de venta
              </p>
              <p className={cn("mt-1 text-2xl font-semibold tabular-nums", data.ganancia >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")}>
                {data.ganancia >= 0 ? "+" : "−"}
                {formatMXN(Math.abs(data.ganancia))}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Precio − costo real de cada pieza, más adelantos entregados, menos lo devuelto. Solo administradores.
              </p>
            </div>
          )}

          {data.sucursalSel === null && data.porSucursal.some((su) => su.ingresos > 0) && (
            <Seccion titulo="Por sucursal" sub="Según el check-in de quien cobró">
              <ul>
                {data.porSucursal.map((su) => (
                  <li key={su.id}>
                    <button
                      type="button"
                      onClick={() => go(data.from, data.to, su.id)}
                      className="flex w-full cursor-pointer items-center gap-2.5 border-t border-border/70 px-4 py-2.5 text-left text-sm hover:bg-muted/40"
                    >
                      <MapPin className={cn("h-4 w-4 shrink-0", su.ingresos ? "text-amber-600" : "text-muted-foreground/50")} />
                      <span className={cn("min-w-0 flex-1 truncate", !su.ingresos && "text-muted-foreground")}>{su.nombre}</span>
                      <span className={cn("font-semibold tabular-nums", !su.ingresos && "text-muted-foreground")}>{formatMXN(su.ingresos)}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}

          {data.porCuenta.length > 0 && (
            <Seccion titulo="Transferencias por cuenta" sub="A dónde llegó el dinero, según los comprobantes">
              <ul>
                {data.porCuenta.map((c) => (
                  <li key={c.cuenta?.id ?? "sin"} className="flex items-center gap-2.5 border-t border-border/70 px-4 py-2.5 text-sm">
                    {c.cuenta ? <BancoIcon banco={c.cuenta.banco} size="sm" /> : <Landmark className="h-4 w-4 text-muted-foreground" />}
                    <span className="min-w-0 flex-1 truncate">{c.cuenta ? c.cuenta.alias : "Sin cuenta"}</span>
                    {!c.cuenta && (
                      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        Falta comprobante
                      </span>
                    )}
                    <span className="shrink-0 font-semibold tabular-nums">{formatMXN(c.monto)}</span>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}

          {data.etiquetado.length > 0 && (
            <Seccion titulo="Efectivo etiquetado" sub="Ya incluido en los ingresos">
              <ul>
                {data.etiquetado.map((e) => (
                  <li key={e.tag} className="border-t border-border/70 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-amber-600" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{e.tag}</span>
                      <span className="text-sm font-semibold tabular-nums">{formatMXN(e.monto)}</span>
                    </div>
                    <ul className="mt-1.5 space-y-0.5 pl-6">
                      {e.productos.map((p) => (
                        <li key={p.sku} className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="min-w-0 flex-1 truncate">
                            {Number.isInteger(p.qty) ? `${p.qty}×` : "abono parcial ·"} {p.nombre}
                          </span>
                          <span className="shrink-0 tabular-nums">{formatMXN(p.monto)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}
        </div>
      </div>

      <MovModal open={mov !== null} onClose={() => setMov(null)} tipo={mov ?? "gasto"} categorias={data.categorias} />
      <IngresosModal open={ventasOpen} onClose={() => setVentasOpen(false)} lineas={data.ingresosDetalle} total={data.ingresosTotal} />
      <InventarioModal inv={invSel} isAdmin={data.isAdmin} onClose={() => setInvSel(null)} />
    </section>
  );
}

function Seccion({ titulo, sub, extra, children }: { titulo: string; sub?: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background">
      <div className="flex items-center gap-3 px-4 pb-3 pt-3.5">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">{titulo}</h2>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        {extra}
      </div>
      {children}
    </div>
  );
}

// Per-inventory sale detail. Modal on desktop, drawer on phones (the shared
// Modal switches). Shows each line: product, human-readable date, quantity, the
// price it sold at, and (admin) our unit cost + line profit.
function InventarioModal({
  inv,
  isAdmin,
  onClose,
}: {
  inv: InvAgg | null;
  isAdmin: boolean;
  onClose: () => void;
}) {
  if (!inv) return null;
  const fmtFecha = (iso: string) =>
    iso
      ? new Date(iso).toLocaleString("es-MX", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";

  return (
    <Modal open onClose={onClose} title={`Ventas · ${inv.nombre}`} className="max-w-2xl">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          {inv.unidades} {inv.unidades === 1 ? "unidad" : "unidades"} ·{" "}
          <span className="font-mono font-semibold text-foreground">
            {formatMXN(inv.ventaCents)}
          </span>
        </span>
        {isAdmin && (
          <span className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
            +{formatMXN(inv.gananciaCents)} ganancia
          </span>
        )}
      </div>

      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-2 font-medium">Producto</th>
              <th className="px-2 py-2 font-medium">Fecha de venta</th>
              <th className="px-2 py-2 text-right font-medium">Cant.</th>
              <th className="px-2 py-2 text-right font-medium">Precio</th>
              {isAdmin && <th className="px-2 py-2 text-right font-medium">Costo</th>}
              {isAdmin && <th className="px-2 py-2 text-right font-medium">Ganancia</th>}
            </tr>
          </thead>
          <tbody>
            {inv.movimientos.map((m, i) => {
              const ganLinea = (m.precioCents - m.costoCents) * m.qty;
              return (
                <tr key={i} className="border-b border-border/60 last:border-0">
                  <td className="px-2 py-2">
                    <span className="font-medium">{m.producto}</span>
                    <span className="ml-1.5 font-mono text-xs text-muted-foreground">{m.sku}</span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-muted-foreground">
                    {fmtFecha(m.fecha)}
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">{m.qty}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">
                    {formatMXN(m.precioCents)}
                  </td>
                  {isAdmin && (
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-muted-foreground">
                      {formatMXN(m.costoCents)}
                    </td>
                  )}
                  {isAdmin && (
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                      +{formatMXN(ganLinea)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/30 text-sm font-semibold">
              <td className="px-2 py-2.5">Total</td>
              <td className="px-2 py-2.5" />
              <td className="px-2 py-2.5 text-right font-mono tabular-nums">{inv.unidades}</td>
              <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                {formatMXN(inv.ventaCents)}
              </td>
              {isAdmin && (
                <td className="px-2 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                  {formatMXN(inv.movimientos.reduce((s, m) => s + m.costoCents * m.qty, 0))}
                </td>
              )}
              {isAdmin && (
                <td className="px-2 py-2.5 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  +{formatMXN(inv.gananciaCents)}
                </td>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </Modal>
  );
}

const TIPO_META: Record<
  IngresoLinea["tipo"],
  { label: string; tone: "neutral" | "warning" | "accent" | "success" }
> = {
  venta: { label: "Venta", tone: "neutral" },
  abono: { label: "Abono nota", tone: "warning" },
  adelanto: { label: "Adelanto", tone: "accent" },
  extra: { label: "Ingreso extra", tone: "success" },
};

function IngresosModal({
  open,
  onClose,
  lineas,
  total,
}: {
  open: boolean;
  onClose: () => void;
  lineas: IngresoLinea[];
  total: number;
}) {
  // Subtotals per source so the modal reconciles the KPI: the chips sum to total.
  const orden: IngresoLinea["tipo"][] = ["venta", "abono", "adelanto", "extra"];
  const subtotales = orden
    .map((tipo) => ({
      tipo,
      monto: lineas
        .filter((l) => l.tipo === tipo)
        .reduce((s, l) => s + l.monto_cents, 0),
    }))
    .filter((s) => s.monto > 0);

  return (
    <Modal open={open} onClose={onClose} title="Ingresos del periodo" className="max-w-xl">
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">
            {lineas.length} {lineas.length === 1 ? "movimiento" : "movimientos"}
          </span>
          <span className="font-mono text-lg font-semibold tabular-nums">
            {formatMXN(total)}
          </span>
        </div>

        {subtotales.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {subtotales.map((s) => (
              <span
                key={s.tipo}
                className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1 text-xs"
              >
                <span className="text-muted-foreground">{TIPO_META[s.tipo].label}</span>
                <span className="font-mono font-semibold tabular-nums">
                  {formatMXN(s.monto)}
                </span>
              </span>
            ))}
          </div>
        )}

        <ul className="max-h-[60vh] divide-y divide-border overflow-auto rounded-xl border border-border">
          {lineas.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{l.concepto}</p>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge tone={TIPO_META[l.tipo].tone}>{TIPO_META[l.tipo].label}</Badge>
                  <Badge tone="neutral">
                    {l.metodo ? (LABEL[l.metodo] ?? l.metodo) : "—"}
                  </Badge>
                  {l.fecha && (
                    <span>
                      ·{" "}
                      {new Date(l.fecha).toLocaleString("es-MX", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  )}
                </div>
              </div>
              <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-accent">
                +{formatMXN(l.monto_cents)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

type MovLista = {
  tipo: "gasto" | "ingreso" | "devolucion";
  id: string;
  concepto: string;
  detalle: string | null;
  metodo: string;
  monto: number;
  fecha: string;
};

function MovRow({ m, isAdmin }: { m: MovLista; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmar, dialogoConfirm] = useConfirm();
  const entra = m.monto > 0;
  const borrable = isAdmin && m.tipo !== "devolucion";

  async function borrar() {
    if (!(await confirmar({ title: `¿Eliminar este ${m.tipo === "gasto" ? "gasto" : "ingreso"}?`, description: "Queda registrado en el cuadre del día como movimiento borrado.", confirmLabel: "Eliminar", tone: "danger" })))
      return;
    start(async () => {
      try {
        await (m.tipo === "ingreso" ? eliminarIngreso(m.id) : eliminarGasto(m.id));
        toast.success(m.tipo === "ingreso" ? "Ingreso eliminado" : "Gasto eliminado");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al eliminar");
      }
    });
  }

  return (
    <li className="group flex items-center gap-3 border-t border-border/70 px-4 py-2.5">
      {dialogoConfirm}
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          entra ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
        )}
      >
        {m.tipo === "devolucion" ? <Undo2 className="h-4 w-4" /> : entra ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{m.concepto}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[
            m.tipo === "gasto" ? "Gasto" : m.tipo === "ingreso" ? "Ingreso extra" : "Devolución",
            LABEL[m.metodo] ?? m.metodo,
            m.detalle,
            new Date(m.fecha).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <span className={cn("shrink-0 text-sm font-semibold tabular-nums", entra ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
        {entra ? "+" : "−"}
        {formatMXN(Math.abs(m.monto))}
      </span>
      {borrable && (
        <button
          type="button"
          onClick={borrar}
          disabled={pending}
          aria-label="Eliminar"
          className="shrink-0 cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

/**
 * Register a gasto or an ingreso extra (same anatomy as the stock adjustment):
 * amount first, concept, how it was paid, a category picked from the ones
 * already used.
 */
export function MovModal({
  open,
  onClose,
  tipo: tipoInicial,
  categorias,
}: {
  open: boolean;
  onClose: () => void;
  tipo: "gasto" | "ingreso";
  categorias?: { gasto: string[]; ingreso: string[] };
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [tipo, setTipo] = useState(tipoInicial);
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<PaymentMethod>("efectivo");
  const [categoria, setCategoria] = useState("");
  const [otra, setOtra] = useState(false);
  const [pending, start] = useTransition();
  const esIngreso = tipo === "ingreso";

  useEffect(() => {
    if (!open) return;
    setTipo(tipoInicial);
    setConcepto("");
    setMonto("");
    setMetodo("efectivo");
    setCategoria("");
    setOtra(false);
  }, [open, tipoInicial]);

  const pesos = Number(monto.replace(",", "."));
  const listo = concepto.trim() && Number.isFinite(pesos) && pesos > 0;
  const sugeridas = (esIngreso ? categorias?.ingreso : categorias?.gasto) ?? [];

  function save() {
    if (!listo) return;
    const payload = { concepto, monto_cents: Math.round(pesos * 100), metodo, categoria: categoria.trim() || null };
    start(async () => {
      try {
        await (esIngreso ? registrarIngreso(payload) : registrarGasto(payload));
        toast.success(esIngreso ? "Ingreso registrado" : "Gasto registrado");
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al registrar");
      }
    });
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} swipeDirection={isMobile ? "down" : "right"} showSwipeHandle={isMobile}>
      <DrawerContent className="data-[swipe-direction=down]:top-16 data-[swipe-direction=down]:max-h-none data-[swipe-direction=right]:w-[min(440px,100vw)]">
        <div className="flex items-center justify-between px-4 py-2.5 sm:px-6 sm:pt-5">
          <DrawerTitle className="text-lg font-semibold sm:text-xl">Nuevo movimiento</DrawerTitle>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div data-base-ui-swipe-ignore className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">
          <div className="grid grid-cols-2 rounded-xl bg-muted p-1">
            {(
              [
                ["gasto", "Gasto", ArrowDownRight, "text-red-600"],
                ["ingreso", "Ingreso extra", ArrowUpRight, "text-emerald-600"],
              ] as const
            ).map(([k, label, Icon, color]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setTipo(k);
                  setCategoria("");
                }}
                className={cn("flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-sm font-medium", tipo === k ? "bg-background shadow-sm" : "text-muted-foreground")}
              >
                <Icon className={cn("h-4 w-4", color)} /> {label}
              </button>
            ))}
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">Monto</span>
            <div className="flex h-16 items-center gap-2 rounded-xl border-2 border-foreground px-4">
              <span className="text-2xl text-muted-foreground">$</span>
              <input
                autoFocus={!isMobile}
                inputMode="decimal"
                value={monto}
                onChange={(e) => setMonto(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="0.00"
                className="w-full min-w-0 bg-transparent text-3xl font-semibold tabular-nums outline-none"
              />
            </div>
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">Concepto</span>
            <Input
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder={esIngreso ? "Ej. instalación de pantalla" : "Ej. comida del turno, renta, proveedor"}
              className="h-11 text-base sm:text-sm"
            />
          </label>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">{esIngreso ? "¿Cómo se cobró?" : "¿Con qué se pagó?"}</legend>
            <div className="flex flex-wrap gap-2">
              {METODOS.map(([k, label]) => (
                <Chip key={k} activo={metodo === k} onClick={() => setMetodo(k)}>
                  {label}
                </Chip>
              ))}
            </div>
            {metodo === "efectivo" && (
              <p className="text-xs text-muted-foreground">{esIngreso ? "Entra al efectivo del cajón." : "Sale del efectivo del cajón."}</p>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">
              Categoría <span className="font-normal text-muted-foreground">· opcional</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {sugeridas.map((c) => (
                <Chip key={c} activo={categoria === c && !otra} onClick={() => { setOtra(false); setCategoria(categoria === c ? "" : c); }}>
                  {c}
                </Chip>
              ))}
              <Chip activo={otra} onClick={() => { setOtra(true); setCategoria(""); }} punteado>
                <Plus className="h-3.5 w-3.5" /> {sugeridas.length ? "Otra" : "Escribir"}
              </Chip>
            </div>
            {otra && (
              <Input autoFocus value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder={esIngreso ? "Instalación, reparación…" : "Renta, proveedor, sueldos…"} className="h-11 text-base sm:text-sm" />
            )}
          </fieldset>
        </div>
        <div className="flex gap-2.5 border-t border-border px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
          <Button variant="secondary" className="hidden h-12 flex-1 sm:inline-flex" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button className="h-12 flex-[2] text-base sm:text-sm" onClick={save} loading={pending} disabled={!listo}>
            {esIngreso ? "Registrar ingreso" : "Registrar gasto"}
            {listo && ` de ${formatMXN(Math.round(pesos * 100))}`}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Chip({ activo, onClick, punteado, children }: { activo: boolean; onClick: () => void; punteado?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm sm:h-10",
        activo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
        punteado && !activo && "border-dashed",
      )}
    >
      {activo && !punteado && <Check className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}
