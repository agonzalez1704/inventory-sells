"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setPosClickAbreDetalle } from "./negocio";

/**
 * The shop-wide click behavior, saved the moment it is tapped — a toggle that
 * waits for a distant Guardar button is a toggle somebody leaves half-flipped.
 * Optimistic with rollback, same shape as the role-notification chips.
 */
export function PosModoClick({ inicial }: { inicial: boolean }) {
  const [valor, setValor] = useState(inicial);
  const [pending, start] = useTransition();

  function elegir(v: boolean) {
    if (v === valor) return;
    const antes = valor;
    setValor(v);
    start(async () => {
      try {
        await setPosClickAbreDetalle(v);
        toast.success(v ? "Un clic abre la descripción" : "Un clic agrega directo");
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
          [false, "Agregar directo", "Un clic mete la pieza a la venta. Para venta rápida y repetida."],
          [true, "Abrir la descripción", "Un clic muestra la pieza; agregar es el botón del detalle (y el + de la tarjeta)."],
        ] as const
      ).map(([v, titulo, detalle]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => elegir(v)}
          className={cn(
            "cursor-pointer rounded-lg border p-3 text-left transition-colors",
            valor === v ? "border-ring bg-muted" : "border-border hover:border-ring/40",
          )}
        >
          <span className="block text-sm font-medium">{titulo}</span>
          <span className="block text-xs text-muted-foreground">{detalle}</span>
        </button>
      ))}
    </fieldset>
  );
}
