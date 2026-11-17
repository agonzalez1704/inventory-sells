"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { setAgenteActivo } from "./negocio";

/** Shop-wide off switch for the WhatsApp agent. Instant-save toggle, same
 *  optimistic shape as the other chips. */
export function AgenteToggle({ inicial }: { inicial: boolean }) {
  const [valor, setValor] = useState(inicial);
  const [pending, start] = useTransition();

  function elegir(v: boolean) {
    if (v === valor) return;
    const antes = valor;
    setValor(v);
    start(async () => {
      try {
        await setAgenteActivo(v);
        toast.success(v ? "El asistente de WhatsApp vuelve a contestar" : "El asistente de WhatsApp quedó apagado");
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
          [true, "Encendido", "El asistente contesta los mensajes de WhatsApp."],
          [false, "Apagado", "No contesta. Los mensajes siguen llegando a la bandeja para que los atienda una persona."],
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
