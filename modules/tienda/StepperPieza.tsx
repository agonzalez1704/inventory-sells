"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Quantity for one line — 44px targets (the old 28px buttons were a miss on a
 * phone). At 1 the minus becomes a trash can: taking the last one out removes
 * the line, and the icon says so before the tap.
 */
export function StepperPieza({
  qty,
  max,
  nombre,
  onChange,
  minimo = 0,
  compacto = false,
}: {
  qty: number;
  max: number;
  nombre: string;
  onChange: (qty: number) => void;
  /** 0 = the minus can remove the line (cart); 1 = it stops at one (product page). */
  minimo?: 0 | 1;
  /** Desktop order rail: a narrow column, a mouse rather than a thumb. */
  compacto?: boolean;
}) {
  const quita = minimo === 0 && qty === 1;
  const boton = cn(
    "flex cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30",
    compacto ? "h-8 w-8" : "h-11 w-11",
  );
  const icono = compacto ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <div
      className={cn(
        "flex shrink-0 items-center border border-border bg-background",
        compacto ? "h-8 w-[104px] rounded-lg" : "h-11 w-[132px] rounded-xl",
      )}
    >
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        disabled={qty <= minimo}
        aria-label={quita ? `Quitar ${nombre}` : "Quitar uno"}
        className={boton}
      >
        {quita ? <Trash2 className={icono} /> : <Minus className={icono} />}
      </button>
      <span className={cn("flex-1 text-center tabular-nums text-foreground", compacto ? "text-[13px]" : "text-[15px]")}>{qty}</span>
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        disabled={qty >= max}
        aria-label="Agregar uno"
        className={boton}
      >
        <Plus className={icono} />
      </button>
    </div>
  );
}
