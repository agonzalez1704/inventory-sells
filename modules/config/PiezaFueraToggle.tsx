"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setPiezaFueraActiva } from "./negocio";

/** Shop-wide: does the register offer buying a part next door with drawer
 *  cash? Instant-save toggle, same optimistic shape as the other chips. */
export function PiezaFueraToggle({ inicial }: { inicial: boolean }) {
  const [valor, setValor] = useState(inicial);
  const [pending, start] = useTransition();

  function elegir(v: boolean) {
    if (v === valor) return;
    const antes = valor;
    setValor(v);
    start(async () => {
      try {
        await setPiezaFueraActiva(v);
        toast.success(v ? "Pieza de fuera activada en el POS" : "Pieza de fuera oculta en el POS");
      } catch (e) {
        setValor(antes);
        toast.error(e instanceof Error ? e.message : "No se pudo guardar");
      }
    });
  }

  return (
    <fieldset className="grid gap-2 sm:grid-cols-2" disabled={pending}>
      {(
        [
          [false, "Oculta", "El POS no ofrece comprar piezas al vecino."],
          [true, "Activa", "Botón «De fuera» en el POS: se compra al vecino con efectivo del cajón y se entrega a crédito o se cobra."],
        ] as const
      ).map(([v, titulo, detalle]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => elegir(v)}
          className={cn(
            "cursor-pointer rounded-xl border p-3 text-left transition-colors",
            valor === v ? "border-ring bg-brand-soft" : "border-border hover:border-ring/40",
          )}
        >
          <span className="block text-sm font-medium">{titulo}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{detalle}</span>
        </button>
      ))}
    </fieldset>
  );
}
