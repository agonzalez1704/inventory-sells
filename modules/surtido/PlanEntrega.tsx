"use client";

import { CheckCircle2, Truck, Clock, AlertTriangle, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { entregaTexto, type PlanSurtido } from "@/lib/surtido";

// What the seller reads out to the customer: what goes now, what waits on whom,
// and the one date that matters — when the whole order is complete.
export function PlanEntrega({ plan }: { plan: PlanSurtido }) {
  if (plan.grupos.length === 0 && plan.desconocidos.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Truck className="h-4 w-4" />
          Entrega
        </p>
        {plan.completo ? (
          <Badge tone="accent">
            <CheckCircle2 className="mr-1 inline h-3 w-3" />
            Todo en existencia
          </Badge>
        ) : (
          <Badge tone="warning">
            <Clock className="mr-1 inline h-3 w-3" />
            Completo {entregaTexto(plan.diasParaCompletar)}
          </Badge>
        )}
      </div>

      <ul className="divide-y divide-border">
        {plan.grupos.map((g) => (
          <li key={g.proveedor} className="px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {g.proveedor === "En existencia" ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Package className="h-3.5 w-3.5" />
                    Se entrega hoy
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5" />
                    {g.proveedor}
                  </span>
                )}
              </p>
              <span className="text-xs text-muted-foreground">
                {g.piezas} {g.piezas === 1 ? "pieza" : "piezas"}
                {g.proveedor !== "En existencia" && ` · llega ${entregaTexto(g.leadTimeDias)}`}
              </span>
            </div>
            <ul className="mt-1.5 space-y-0.5">
              {g.lineas.map((l, i) => (
                <li key={`${l.sku}-${i}`} className="text-xs text-muted-foreground">
                  {l.qty} × {l.nombre}
                </li>
              ))}
            </ul>
          </li>
        ))}

        {plan.desconocidos.length > 0 && (
          <li className="px-4 py-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              Sin fecha
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {plan.desconocidos.map((l, i) => (
                <li key={`${l.sku}-${i}`} className="text-xs text-muted-foreground">
                  {l.qty} × {l.nombre} — no está en el catálogo
                </li>
              ))}
            </ul>
          </li>
        )}
      </ul>
    </Card>
  );
}
