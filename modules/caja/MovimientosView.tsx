"use client";

import { useState } from "react";
import { Plus, TrendingDown, TrendingUp } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MovModal, type Gasto } from "./CajaView";
import { ContarEfectivo } from "./ContarEfectivo";
import { Banknote } from "lucide-react";

// The seller-facing slice of the caja: register a gasto or an ingreso extra
// WITHOUT seeing the corte. The list below is only what this user captured
// today — confirmation that it landed, not a financial report.
export function MovimientosView({
  gastos,
  ingresos,
  cajon,
  cerrado,
  hoy,
}: {
  gastos: Gasto[];
  ingresos: Gasto[];
  /** The drawer this person may count; null = no check-in today. */
  cajon: { sucursalId: string | null; nombre: string | null } | null;
  cerrado: boolean;
  hoy: string;
}) {
  const [contar, setContar] = useState<"conteo" | "cierre" | null>(null);
  const [gastoOpen, setGastoOpen] = useState(false);
  const [ingresoOpen, setIngresoOpen] = useState(false);

  const filas = [
    ...gastos.map((g) => ({ ...g, tipo: "gasto" as const })),
    ...ingresos.map((g) => ({ ...g, tipo: "ingreso" as const })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Movimientos de caja</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Registra gastos e ingresos extra. Aquí abajo aparecen los que TÚ
            capturaste hoy.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setIngresoOpen(true)}>
            <Plus className="h-4 w-4" />
            Ingreso extra
          </Button>
          <Button onClick={() => setGastoOpen(true)}>
            <Plus className="h-4 w-4" />
            Registrar gasto
          </Button>
        </div>
      </div>

      {/* Blind count: what's in the drawer, without seeing what there should be. */}
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand-foreground">
          <Banknote className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Caja{cajon?.nombre ? ` · ${cajon.nombre}` : ""}</p>
          <p className="text-xs text-muted-foreground">
            {cerrado
              ? "El día ya está cerrado."
              : cajon
                ? "Cuenta el efectivo a media jornada o al cerrar."
                : "Haz check-in en tu sucursal para contar su caja."}
          </p>
        </div>
        {!cerrado && cajon && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setContar("conteo")}>
              Contar
            </Button>
            <Button onClick={() => setContar("cierre")}>Cerrar el día</Button>
          </div>
        )}
      </Card>

      {filas.length === 0 ? (
        <EmptyState
          icon={TrendingDown}
          title="Sin movimientos tuyos hoy"
          description="Lo que registres aparece aquí como confirmación."
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {filas.map((f) => (
              <li key={`${f.tipo}-${f.id}`} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={
                    f.tipo === "gasto"
                      ? "flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                      : "flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent"
                  }
                >
                  {f.tipo === "gasto" ? (
                    <TrendingDown className="h-4 w-4" />
                  ) : (
                    <TrendingUp className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{f.concepto}</span>
                  <span className="block text-xs text-muted-foreground">
                    {f.categoria ? `${f.categoria} · ` : ""}
                    {new Date(f.created_at).toLocaleTimeString("es-MX", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </span>
                <span
                  className={
                    "shrink-0 font-mono text-sm font-semibold tabular-nums " +
                    (f.tipo === "gasto" ? "text-red-600 dark:text-red-400" : "text-accent")
                  }
                >
                  {f.tipo === "gasto" ? "−" : "+"}
                  {formatMXN(f.monto_cents)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <MovModal open={gastoOpen} onClose={() => setGastoOpen(false)} tipo="gasto" />
      <MovModal open={ingresoOpen} onClose={() => setIngresoOpen(false)} tipo="ingreso" />
      {cajon && (
        <ContarEfectivo
          open={contar !== null}
          onClose={() => setContar(null)}
          tipo={contar ?? "conteo"}
          fecha={hoy}
          fechaLabel="Hoy"
          sucursalId={cajon.sucursalId}
          sucursalNombre={cajon.nombre}
          esperadoCents={null}
          fondoSugeridoCents={0}
        />
      )}
    </section>
  );
}
