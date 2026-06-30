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
} from "lucide-react";
import { formatMXN } from "@/lib/money";
import type { PaymentMethod } from "@/lib/types";
import { imprimirCorteNavegador, type CorteData } from "@/lib/corte";
import { imprimirCorteUSB, webUsbDisponible } from "@/lib/escpos-usb";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { registrarGasto, eliminarGasto } from "./actions";

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

export type CajaData = {
  from: string;
  to: string;
  isAdmin: boolean;
  ventasCount: number;
  ingresosPorMetodo: Record<PaymentMethod, number>;
  gastosPorMetodo: Record<PaymentMethod, number>;
  ingresosTotal: number;
  gastosTotal: number;
  gastos: Gasto[];
};

function ymd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA").format(d);
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  tone?: "default" | "in" | "out";
}) {
  return (
    <Card className="p-4">
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

  const balance = data.ingresosTotal - data.gastosTotal;
  const efectivoCaja =
    (data.ingresosPorMetodo.efectivo ?? 0) - (data.gastosPorMetodo.efectivo ?? 0);
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
      balance,
      efectivoCaja,
      ventasCount: data.ventasCount,
      gastosCount: data.gastos.length,
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
            {rangoLabel} · {data.ventasCount} ventas · {data.gastos.length} gastos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => imprimirCorteNavegador(buildCorte())}>
            <Printer className="h-4 w-4" />
            Imprimir corte
          </Button>
          {usbOk && (
            <Button
              variant="secondary"
              onClick={imprimirUSB}
              loading={usbBusy}
              title="Impresión directa por USB (ESC/POS)"
            >
              <Usb className="h-4 w-4" />
              USB
            </Button>
          )}
          <Button onClick={() => setGastoOpen(true)}>
            <Plus className="h-4 w-4" />
            Registrar gasto
          </Button>
        </div>
      </div>

      {/* Date controls */}
      <Card className="flex flex-wrap items-end gap-3 p-3">
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
        <div className="flex items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Desde</span>
            <Input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 w-auto"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Hasta</span>
            <Input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 w-auto"
            />
          </label>
          <Button variant="secondary" onClick={() => go(from, to)}>
            Aplicar
          </Button>
        </div>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={TrendingUp} label="Ingresos" value={formatMXN(data.ingresosTotal)} tone="in" />
        <Kpi icon={TrendingDown} label="Gastos" value={formatMXN(data.gastosTotal)} tone="out" />
        <Kpi icon={Scale} label="Balance" value={formatMXN(balance)} />
        <Kpi icon={Wallet} label="Efectivo en caja" value={formatMXN(efectivoCaja)} />
      </div>

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
              <th className="px-4 py-2 text-right font-medium">Neto</th>
            </tr>
          </thead>
          <tbody>
            {METODOS.map(([m, label]) => {
              const ing = data.ingresosPorMetodo[m] ?? 0;
              const gas = data.gastosPorMetodo[m] ?? 0;
              if (ing === 0 && gas === 0) return null;
              return (
                <tr key={m} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2">{label}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{formatMXN(ing)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums text-muted-foreground">
                    {gas ? `−${formatMXN(gas)}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-medium tabular-nums">
                    {formatMXN(ing - gas)}
                  </td>
                </tr>
              );
            })}
            {data.ingresosTotal === 0 && data.gastosTotal === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Sin movimientos en este rango.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

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
              <GastoRow key={g.id} g={g} isAdmin={data.isAdmin} />
            ))}
          </ul>
        )}
      </Card>

      <GastoModal open={gastoOpen} onClose={() => setGastoOpen(false)} />
    </section>
  );
}

function GastoRow({ g, isAdmin }: { g: Gasto; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function borrar() {
    if (!confirm("¿Eliminar este gasto?")) return;
    start(async () => {
      try {
        await eliminarGasto(g.id);
        toast.success("Gasto eliminado");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al eliminar");
      }
    });
  }

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{g.concepto}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Badge tone="neutral">{LABEL[g.metodo] ?? g.metodo}</Badge>
          {g.categoria && <span>· {g.categoria}</span>}
          <span>
            ·{" "}
            {new Date(g.created_at).toLocaleString("es-MX", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
        </div>
      </div>
      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-red-600">
        −{formatMXN(g.monto_cents)}
      </span>
      {isAdmin && (
        <button
          onClick={borrar}
          disabled={pending}
          aria-label="Eliminar gasto"
          className="shrink-0 cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

function GastoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
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
    start(async () => {
      try {
        await registrarGasto({
          concepto,
          monto_cents: Math.round(pesos * 100),
          metodo,
          categoria: categoria.trim() || null,
        });
        toast.success("Gasto registrado");
        reset();
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al registrar");
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar gasto" className="max-w-md">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Concepto</span>
          <Input
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Ej: Renta del local, pago a proveedor…"
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
            placeholder="Renta · Proveedor · Servicios · Sueldos…"
          />
        </label>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={save} loading={pending}>
            Guardar gasto
          </Button>
        </div>
      </div>
    </Modal>
  );
}
