"use client";

import { CheckCircle2, Truck, Clock, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { entregaTexto } from "@/lib/surtido";
import type { FaltantesProveedor } from "./actions";

// The buyer's list: what to order from whom, and which customers are waiting.
export function SurtidoView({ grupos }: { grupos: FaltantesProveedor[] }) {
  const totalPiezas = grupos.reduce((s, g) => s + g.piezas, 0);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Por surtir</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lo que hay que pedir para cumplir las cotizaciones vivas
          {totalPiezas > 0 && ` · ${totalPiezas} piezas`}
        </p>
      </div>

      {grupos.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nada por pedir"
          description="Todo lo cotizado está en existencia."
        />
      ) : (
        <div className="space-y-4">
          {grupos.map((g) => {
            const sinProveedor = g.proveedor === "Sin proveedor asignado";
            return (
              <Card key={g.proveedor} className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {sinProveedor ? (
                      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Truck className="h-4 w-4" />
                    )}
                    {g.proveedor}
                  </p>
                  <div className="flex items-center gap-2">
                    {!sinProveedor && (
                      <Badge tone="neutral">
                        <Clock className="mr-1 inline h-3 w-3" />
                        llega {entregaTexto(g.leadTimeDias)}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {g.piezas} {g.piezas === 1 ? "pieza" : "piezas"}
                    </span>
                  </div>
                </div>

                {sinProveedor && (
                  <p className="border-b border-border bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                    Estos productos no tienen proveedor asignado — nadie a quién pedírselos.
                    Asígnales uno en el editor del producto.
                  </p>
                )}

                <ul className="divide-y divide-border">
                  {g.lineas.map((l) => (
                    <li key={l.sku} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{l.nombre}</p>
                        <p className="text-xs text-muted-foreground">
                          {l.sku} · {l.pedidas} cotizadas, {l.enExistencia} en existencia
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Para: {l.folios.join(", ")}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums">
                        pedir {l.porPedir}
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
