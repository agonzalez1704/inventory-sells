"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMXN } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import type { PaymentMethod } from "@/lib/types";

function ymd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA").format(d);
}

const METODOS: { value: PaymentMethod; label: string }[] = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "otro", label: "Otro" },
];

export function VentasFiltros({
  from,
  to,
  metodo,
  canal,
  count,
  totalCents,
}: {
  from: string;
  to: string;
  metodo: PaymentMethod | null;
  canal: string | null;
  count: number;
  totalCents: number;
}) {
  const router = useRouter();
  const [desde, setDesde] = useState(from);
  const [hasta, setHasta] = useState(to);

  function go(f: string, t: string, m: string | null, c: string | null) {
    const p = new URLSearchParams({ from: f, to: t });
    if (m) p.set("metodo", m);
    if (c) p.set("canal", c);
    router.push(`/ventas?${p.toString()}`);
  }

  function quick(rango: "hoy" | "ayer" | "7d" | "mes") {
    const now = new Date();
    let f = new Date(now);
    if (rango === "ayer") f.setDate(now.getDate() - 1);
    if (rango === "7d") f.setDate(now.getDate() - 6);
    if (rango === "mes") f = new Date(now.getFullYear(), now.getMonth(), 1);
    const t = rango === "ayer" ? f : now;
    setDesde(ymd(f));
    setHasta(ymd(t));
    go(ymd(f), ymd(t), metodo, canal);
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        <p className="text-xs text-muted-foreground tabular-nums">
          {count} {count === 1 ? "venta" : "ventas"} ·{" "}
          <span className="font-semibold text-foreground">{formatMXN(totalCents)}</span>
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        {/* min-w-0 on each grid cell: a grid item defaults to min-width:auto and
            won't shrink below its content, and an iOS date input's intrinsic
            width is wide — without this the row overflowed the card (and the
            page) on a phone. */}
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-muted-foreground">Desde</span>
          <Input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="h-9 w-full min-w-0" />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-muted-foreground">Hasta</span>
          <Input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} className="h-9 w-full min-w-0" />
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-muted-foreground">Método</span>
          <Select
            value={metodo ?? ""}
            onChange={(e) => go(desde, hasta, e.target.value || null, canal)}
            className="h-9 w-full min-w-0"
          >
            <option value="">Todos</option>
            {METODOS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </Select>
        </label>
        <label className="block min-w-0">
          <span className="mb-1 block text-xs text-muted-foreground">Canal</span>
          <Select
            value={canal ?? ""}
            onChange={(e) => go(desde, hasta, metodo, e.target.value || null)}
            className="h-9 w-full min-w-0"
          >
            <option value="">Todos</option>
            <option value="mostrador">Mostrador</option>
            <option value="online">En línea</option>
          </Select>
        </label>
      </div>

      <div className="flex justify-end">
        <Button variant="brand" className="h-9" onClick={() => go(desde, hasta, metodo, canal)}>
          Aplicar fechas
        </Button>
      </div>
    </Card>
  );
}
