"use client";

import { useEffect, useState } from "react";
import { Wallet, ShoppingBag, CalendarClock } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { resumenCliente, type ResumenCliente } from "./actions";

/**
 * What the shop wants to know the moment a customer is picked: how much they
 * have bought from us, how much they owe, and — when a credit line exists —
 * how much of it is left. Fetches on mount because the numbers live behind an
 * RPC, not in the list payload; a stale figure here is worse than a beat of
 * "Cargando…".
 */
export function ResumenClienteChip({
  customerId,
  className,
}: {
  customerId: string;
  className?: string;
}) {
  const [r, setR] = useState<ResumenCliente | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let on = true;
    setR(null);
    setError(false);
    resumenCliente(customerId)
      .then((data) => on && setR(data))
      .catch(() => on && setError(true));
    return () => {
      on = false;
    };
  }, [customerId]);

  if (error) return null; // the sale must not depend on the summary loading
  if (!r)
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>Cargando resumen…</p>
    );

  const disponible =
    r.credito_limite_cents != null ? r.credito_limite_cents - r.deuda_cents : null;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs", className)}>
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <ShoppingBag className="h-3.5 w-3.5" />
        {r.compras === 0
          ? "Sin compras"
          : `Ha comprado ${formatMXN(r.comprado_cents)} · ${r.compras} ${r.compras === 1 ? "compra" : "compras"}`}
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1",
          r.deuda_cents > 0
            ? "font-medium text-amber-600 dark:text-amber-400"
            : "text-muted-foreground",
        )}
      >
        <Wallet className="h-3.5 w-3.5" />
        {r.deuda_cents > 0
          ? `Debe ${formatMXN(r.deuda_cents)} · ${r.notas_pendientes} ${r.notas_pendientes === 1 ? "nota" : "notas"}`
          : "No debe nada"}
      </span>
      {r.credito_limite_cents != null && disponible != null && (
        <span
          className={cn(
            "inline-flex items-center gap-1",
            disponible <= 0
              ? "font-medium text-red-600 dark:text-red-400"
              : "text-muted-foreground",
          )}
        >
          <CalendarClock className="h-3.5 w-3.5" />
          {disponible <= 0
            ? "Límite de crédito lleno"
            : `Crédito disponible ${formatMXN(disponible)}`}
          {r.credito_dias != null && ` · ${r.credito_dias} días de plazo`}
        </span>
      )}
      {r.credito_limite_cents == null && r.credito_dias != null && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" />
          {r.credito_dias} días de plazo
        </span>
      )}
    </div>
  );
}
