"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  Scale,
  Wallet,
  Printer,
  Usb,
  Coins,
  ChevronRight,
} from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/types";
import { imprimirCorteNavegador, type CorteData } from "@/lib/corte";
import { imprimirCorteUSB, webUsbDisponible } from "@/lib/escpos-usb";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import {
  registrarGasto,
  eliminarGasto,
  registrarIngreso,
  eliminarIngreso,
} from "./actions";

const METODOS: [PaymentMethod, string][] = [
  ["efectivo", "Efectivo"],
  ["tarjeta", "Tarjeta"],
  ["transferencia", "Transferencia"],
  ["otro", "Otro"],
];
const LABEL = Object.fromEntries(METODOS) as Record<string, string>;

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
export type VentaDetalle = {
  id: string;
  total_cents: number;
  metodo: PaymentMethod | null;
  fecha: string;
  tipo: "venta" | "fiado";
  productos: { qty: number; nombre: string }[];
};

export type CajaData = {
  from: string;
  to: string;
  isAdmin: boolean;
  ventasCount: number;
  ingresosPorMetodo: Record<PaymentMethod, number>;
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
  ventasDetalle: VentaDetalle[];
};

function ymd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA").format(d);
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone = "default",
  onClick,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone?: "default" | "in" | "out";
  onClick?: () => void;
}) {
  return (
    <Card
      className={cn(
        "p-4",
        onClick && "cursor-pointer transition-colors hover:border-ring/40 hover:bg-muted/30",
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <span
          className={
            tone === "in"
              ? "flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent"
              : tone === "out"
                ? "flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-600"
                : "flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground"
          }
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {onClick && <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />}
      </div>
      <p className="mt-2.5 font-mono text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
    </Card>
  );
}

export function CajaView({ data }: { data: CajaData }) {
  const router = useRouter();
  const [from, setFrom] = useState(data.from);
  const [to, setTo] = useState(data.to);
  const [gastoOpen, setGastoOpen] = useState(false);
  const [ingresoOpen, setIngresoOpen] = useState(false);
  const [ventasOpen, setVentasOpen] = useState(false);
  const [usbOk, setUsbOk] = useState(false);
  const [usbBusy, setUsbBusy] = useState(false);

  useEffect(() => {
    setUsbOk(webUsbDisponible());
  }, []);

  function go(f: string, t: string) {
    router.push(`/caja?from=${f}&to=${t}`);
  }
  function quick(kind: "hoy" | "ayer" | "7d" | "mes") {
    const now = new Date();
    if (kind === "hoy") {
      const d = ymd(now);
      setFrom(d);
      setTo(d);
      go(d, d);
    } else if (kind === "ayer") {
      const d = ymd(new Date(now.getTime() - 86_400_000));
      setFrom(d);
      setTo(d);
      go(d, d);
    } else if (kind === "7d") {
      const f = ymd(new Date(now.getTime() - 6 * 86_400_000));
      const t = ymd(now);
      setFrom(f);
      setTo(t);
      go(f, t);
    } else {
      const f = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
      const t = ymd(now);
      setFrom(f);
      setTo(t);
      go(f, t);
    }
  }

  const balance =
    data.ingresosTotal - data.gastosTotal - data.devolucionesTotal;
  const efectivoCaja =
    (data.ingresosPorMetodo.efectivo ?? 0) -
    (data.gastosPorMetodo.efectivo ?? 0) -
    (data.devolucionesPorMetodo.efectivo ?? 0);
  const rangoLabel = data.from === data.to ? data.from : `${data.from} → ${data.to}`;

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
      .catch((e) =>
        toast.error(e instanceof Error ? e.message : "No se pudo imprimir por USB"),
      )
      .finally(() => setUsbBusy(false));
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Corte de caja</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rangoLabel} · {data.ventasCount} ventas · {data.ingresos.length} ingresos
            extra · {data.gastos.length} gastos · {data.devoluciones.length}{" "}
            devoluciones
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
          <Button
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => imprimirCorteNavegador(buildCorte())}
          >
            <Printer className="h-4 w-4" />
            Imprimir corte
          </Button>
          {usbOk && (
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={imprimirUSB}
              loading={usbBusy}
              title="Impresión directa por USB (ESC/POS)"
            >
              <Usb className="h-4 w-4" />
              USB
            </Button>
          )}
          <Button
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={() => setIngresoOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Ingreso extra
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => setGastoOpen(true)}>
            <Plus className="h-4 w-4" />
            Registrar gasto
          </Button>
        </div>
      </div>

      {/* Date controls */}
      <Card className="space-y-3 p-3">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["hoy", "Hoy"],
              ["ayer", "Ayer"],
              ["7d", "7 días"],
              ["mes", "Mes"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => quick(k)}
              className="cursor-pointer rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block sm:flex-1">
            <span className="mb-1 block text-xs text-muted-foreground">Desde</span>
            <Input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 w-full"
            />
          </label>
          <label className="block sm:flex-1">
            <span className="mb-1 block text-xs text-muted-foreground">Hasta</span>
            <Input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 w-full"
            />
          </label>
          <Button
            variant="secondary"
            className="h-9 w-full sm:w-auto"
            onClick={() => go(from, to)}
          >
            Aplicar
          </Button>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={TrendingUp}
          label="Ingresos"
          value={formatMXN(data.ingresosTotal)}
          tone="in"
          onClick={data.ventasDetalle.length > 0 ? () => setVentasOpen(true) : undefined}
        />
        <Kpi icon={TrendingDown} label="Gastos" value={formatMXN(data.gastosTotal)} tone="out" />
        <Kpi icon={Scale} label="Balance" value={formatMXN(balance)} />
        <Kpi icon={Wallet} label="Efectivo en caja" value={formatMXN(efectivoCaja)} />
      </div>

      {data.ganancia !== null && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-brand/40 bg-brand-soft/30 p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
              <Coins className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Ganancia neta de venta</p>
              <p className="text-xs text-muted-foreground">
                Precio − costo, menos lo devuelto · {rangoLabel}
              </p>
            </div>
          </div>
          <p className="font-mono text-2xl font-semibold tabular-nums text-brand-foreground">
            {formatMXN(data.ganancia)}
          </p>
        </Card>
      )}

      {/* Breakdown by method */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Por método de pago</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-medium">Método</th>
              <th className="px-4 py-2 text-right font-medium">Ingresos</th>
              <th className="px-4 py-2 text-right font-medium">Gastos</th>
              <th className="px-4 py-2 text-right font-medium">Devol.</th>
              <th className="px-4 py-2 text-right font-medium">Neto</th>
            </tr>
          </thead>
          <tbody>
            {METODOS.map(([m, label]) => {
              const ing = data.ingresosPorMetodo[m] ?? 0;
              const gas = data.gastosPorMetodo[m] ?? 0;
              const dev = data.devolucionesPorMetodo[m] ?? 0;
              if (ing === 0 && gas === 0 && dev === 0) return null;
              return (
                <tr key={m} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2">{label}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{formatMXN(ing)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {gas ? `−${formatMXN(gas)}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {dev ? `−${formatMXN(dev)}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-medium tabular-nums">
                    {formatMXN(ing - gas - dev)}
                  </td>
                </tr>
              );
            })}
            {data.ingresosTotal === 0 &&
              data.gastosTotal === 0 &&
              data.devolucionesTotal === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted-foreground">
                    Sin movimientos en este rango.
                  </td>
                </tr>
              )}
          </tbody>
        </table>
      </Card>

      {/* Efectivo etiquetado (subset of income, split per tag) */}
      {data.etiquetado.length > 0 && (
        <Card className="overflow-hidden border-brand/40">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Efectivo etiquetado</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ya incluido en los ingresos de arriba. Aquí separado para
              reportarlo aparte.
            </p>
          </div>
          <ul className="divide-y divide-border">
            {data.etiquetado.map((e) => (
              <li key={e.tag} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <Badge tone="warning">{e.tag}</Badge>
                  <span className="font-mono text-sm font-semibold tabular-nums">
                    {formatMXN(e.monto)}
                  </span>
                </div>
                <ul className="mt-2 space-y-1">
                  {e.productos.map((p) => (
                    <li
                      key={p.sku}
                      className="flex items-center justify-between gap-3 text-xs text-muted-foreground"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium tabular-nums">{p.qty}×</span>{" "}
                        {p.nombre}
                      </span>
                      <span className="shrink-0 font-mono tabular-nums">
                        {formatMXN(p.monto)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Devoluciones list */}
      {data.devoluciones.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Devoluciones del periodo</h2>
          </div>
          <ul className="divide-y divide-border">
            {data.devoluciones.map((d) => (
              <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {d.motivo || "Devolución"}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Badge tone="neutral">{LABEL[d.metodo] ?? d.metodo}</Badge>
                    <span>
                      ·{" "}
                      {new Date(d.created_at).toLocaleString("es-MX", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>
                </div>
                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-red-600">
                  −{formatMXN(d.monto_cents)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Ingresos extra list */}
      {data.ingresos.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Ingresos extra del periodo</h2>
          </div>
          <ul className="divide-y divide-border">
            {data.ingresos.map((i) => (
              <MovRow key={i.id} m={i} isAdmin={data.isAdmin} tipo="ingreso" />
            ))}
          </ul>
        </Card>
      )}

      {/* Gastos list */}
      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Gastos del periodo</h2>
        </div>
        {data.gastos.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={TrendingDown}
              title="Sin gastos"
              description="Registra renta, proveedores, servicios… para que el corte cuadre."
              className="border-0 py-8"
            />
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {data.gastos.map((g) => (
              <MovRow key={g.id} m={g} isAdmin={data.isAdmin} tipo="gasto" />
            ))}
          </ul>
        )}
      </Card>

      <MovModal open={gastoOpen} onClose={() => setGastoOpen(false)} tipo="gasto" />
      <MovModal open={ingresoOpen} onClose={() => setIngresoOpen(false)} tipo="ingreso" />
      <VentasModal
        open={ventasOpen}
        onClose={() => setVentasOpen(false)}
        ventas={data.ventasDetalle}
        total={data.ventasDetalle.reduce((s, v) => s + v.total_cents, 0)}
      />
    </section>
  );
}

function VentasModal({
  open,
  onClose,
  ventas,
  total,
}: {
  open: boolean;
  onClose: () => void;
  ventas: VentaDetalle[];
  total: number;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Ventas del periodo" className="max-w-xl">
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted-foreground">
            {ventas.length} {ventas.length === 1 ? "venta" : "ventas"}
          </span>
          <span className="font-mono text-lg font-semibold tabular-nums">
            {formatMXN(total)}
          </span>
        </div>
        <ul className="max-h-[60vh] divide-y divide-border overflow-auto rounded-xl border border-border">
          {ventas.map((v) => (
            <li key={v.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {v.productos.length > 0
                    ? v.productos
                        .map((p) => `${p.qty > 1 ? `${p.qty}× ` : ""}${p.nombre}`)
                        .join(" · ")
                    : "Sin productos"}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  {v.tipo === "fiado" && <Badge tone="warning">Fiado</Badge>}
                  <Badge tone="neutral">
                    {v.metodo ? (LABEL[v.metodo] ?? v.metodo) : "—"}
                  </Badge>
                  {v.fecha && (
                    <span>
                      ·{" "}
                      {new Date(v.fecha).toLocaleString("es-MX", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  )}
                </div>
              </div>
              <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
                {formatMXN(v.total_cents)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}

function MovRow({
  m,
  isAdmin,
  tipo,
}: {
  m: Gasto;
  isAdmin: boolean;
  tipo: "gasto" | "ingreso";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const esIngreso = tipo === "ingreso";

  function borrar() {
    if (!confirm(`¿Eliminar este ${tipo}?`)) return;
    start(async () => {
      try {
        await (esIngreso ? eliminarIngreso(m.id) : eliminarGasto(m.id));
        toast.success(`${esIngreso ? "Ingreso" : "Gasto"} eliminado`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al eliminar");
      }
    });
  }

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{m.concepto}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Badge tone="neutral">{LABEL[m.metodo] ?? m.metodo}</Badge>
          {m.categoria && <span>· {m.categoria}</span>}
          <span>
            ·{" "}
            {new Date(m.created_at).toLocaleString("es-MX", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
        </div>
      </div>
      <span
        className={cn(
          "shrink-0 font-mono text-sm font-semibold tabular-nums",
          esIngreso ? "text-accent" : "text-red-600",
        )}
      >
        {esIngreso ? "+" : "−"}
        {formatMXN(m.monto_cents)}
      </span>
      {isAdmin && (
        <button
          onClick={borrar}
          disabled={pending}
          aria-label={`Eliminar ${tipo}`}
          className="shrink-0 cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

function MovModal({
  open,
  onClose,
  tipo,
}: {
  open: boolean;
  onClose: () => void;
  tipo: "gasto" | "ingreso";
}) {
  const router = useRouter();
  const esIngreso = tipo === "ingreso";
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<PaymentMethod>("efectivo");
  const [categoria, setCategoria] = useState("");
  const [pending, start] = useTransition();

  function reset() {
    setConcepto("");
    setMonto("");
    setMetodo("efectivo");
    setCategoria("");
  }

  function save() {
    const pesos = Number(monto.replace(",", "."));
    if (!concepto.trim()) return toast.error("Falta el concepto");
    if (!Number.isFinite(pesos) || pesos <= 0) return toast.error("Monto inválido");
    const payload = {
      concepto,
      monto_cents: Math.round(pesos * 100),
      metodo,
      categoria: categoria.trim() || null,
    };
    start(async () => {
      try {
        await (esIngreso ? registrarIngreso(payload) : registrarGasto(payload));
        toast.success(esIngreso ? "Ingreso registrado" : "Gasto registrado");
        reset();
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al registrar");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={esIngreso ? "Registrar ingreso extra" : "Registrar gasto"}
      className="max-w-md"
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Concepto</span>
          <Input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder={
              esIngreso
                ? "Ej: Instalación de pantalla, reparación…"
                : "Ej: Renta del local, pago a proveedor…"
            }
            autoFocus
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Monto (MXN)</span>
            <Input
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Método</span>
            <Select value={metodo} onChange={(e) => setMetodo(e.target.value as PaymentMethod)}>
              {METODOS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Categoría (opcional)
          </span>
          <Input
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            placeholder={
              esIngreso
                ? "Instalación · Reparación · Servicio…"
                : "Renta · Proveedor · Servicios · Sueldos…"
            }
          />
        </label>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={save} loading={pending}>
            {esIngreso ? "Guardar ingreso" : "Guardar gasto"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
