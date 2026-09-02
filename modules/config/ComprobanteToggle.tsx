"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setComprobanteObligatorio } from "./negocio";

/** Shop-wide: does a transfer payment demand its proof? Instant-save toggle,
 *  same optimistic shape as the POS click-mode chips. */
export function ComprobanteToggle({ inicial }: { inicial: boolean }) {
  const [valor, setValor] = useState(inicial);
  const [pending, start] = useTransition();

  function elegir(v: boolean) {
    if (v === valor) return;
    const antes = valor;
    setValor(v);
    start(async () => {
      try {
        await setComprobanteObligatorio(v);
        toast.success(v ? "Comprobante obligatorio en transferencias" : "Comprobante opcional");
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
          [false, "Opcional", "Se puede cobrar una transferencia sin capturar referencia ni foto."],
          [true, "Obligatorio", "No se completa un cobro por transferencia sin referencia o captura."],
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
