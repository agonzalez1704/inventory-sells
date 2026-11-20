"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Wallet, ShoppingBag, CalendarClock, Lock, Unlock } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { resumenCliente, liberarCreditoHoy, type ResumenCliente } from "./actions";

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
  puedeLiberar = false,
}: {
  customerId: string;
  className?: string;
  /** Admin: offer "Liberar por hoy" when the customer's credit is stopped. */
  puedeLiberar?: boolean;
}) {
  const [r, setR] = useState<ResumenCliente | null>(null);
  const [error, setError] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const [liberando, startLiberar] = useTransition();

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
  }, [customerId, vuelta]);

  if (error) return null; // the sale must not depend on the summary loading
  if (!r)
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>Cargando resumen…</p>
    );

  const disponible =
    r.credito_limite_cents != null ? r.credito_limite_cents - r.deuda_cents : null;
  const detenido =
    !!r.bloqueo_motivo || r.notas_vencidas > 0 || (disponible != null && disponible <= 0);

  function liberar() {
    startLiberar(async () => {
      const res = await liberarCreditoHoy(customerId);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Liberado por hoy");
      setVuelta((v) => v + 1);
    });
  }

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
      {r.notas_vencidas > 0 && (
        <span className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
          <CalendarClock className="h-3.5 w-3.5" />
          Vencido {formatMXN(r.vencido_cents)} · {r.notas_vencidas}{" "}
          {r.notas_vencidas === 1 ? "nota" : "notas"} (hace {r.dias_mas_vieja} días)
        </span>
      )}
      {r.bloqueo_motivo && (
        <span className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400">
          <Lock className="h-3.5 w-3.5" />
          Bloqueado: {r.bloqueo_motivo}
        </span>
      )}
      {r.liberado_hoy ? (
        <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400">
          <Unlock className="h-3.5 w-3.5" />
          Liberado por hoy
        </span>
      ) : (
        puedeLiberar &&
        detenido && (
          <button
            type="button"
            onClick={liberar}
            disabled={liberando}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-2 py-0.5 font-medium hover:bg-muted disabled:opacity-50"
          >
            <Unlock className="h-3.5 w-3.5" />
            {liberando ? "Liberando…" : "Liberar por hoy"}
          </button>
        )
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
