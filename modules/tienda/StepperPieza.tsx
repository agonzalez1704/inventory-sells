"use client";

import { Minus, Plus, Trash2 } from "lucide-react";

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
}: {
  qty: number;
  max: number;
  nombre: string;
  onChange: (qty: number) => void;
  /** 0 = the minus can remove the line (cart); 1 = it stops at one (product page). */
  minimo?: 0 | 1;
}) {
  const quita = minimo === 0 && qty === 1;
  return (
    <div className="flex h-11 w-[132px] shrink-0 items-center rounded-xl border border-border bg-background">
      <button
        type="button"
        onClick={() => onChange(qty - 1)}
        disabled={qty <= minimo}
        aria-label={quita ? `Quitar ${nombre}` : "Quitar uno"}
        className="flex h-11 w-11 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
      >
        {quita ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
      </button>
      <span className="flex-1 text-center text-[15px] tabular-nums text-foreground">{qty}</span>
      <button
        type="button"
        onClick={() => onChange(qty + 1)}
        disabled={qty >= max}
        aria-label="Agregar uno"
        className="flex h-11 w-11 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
