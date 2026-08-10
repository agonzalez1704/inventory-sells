"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/errors";
import { setPrecioBasePos, type PrecioBase } from "./pos-prefs";

// Per user, not per business: two people at the same counter want different
// things on screen, and the seller's is the one a customer can see over their
// shoulder.
export function PosPrefs({ inicial }: { inicial: PrecioBase }) {
  const [base, setBase] = useState<PrecioBase>(inicial);
  const [pending, start] = useTransition();

  function elegir(v: PrecioBase) {
    const antes = base;
    setBase(v);
    start(async () => {
      try {
        unwrap(await setPrecioBasePos(v));
        toast.success(v === "costo" ? "Verás el costo" : "Verás el precio de venta");
      } catch (e) {
        // Put the switch back: leaving it on the value that failed to save
        // means the next reload silently contradicts it.
        setBase(antes);
        toast.error(e instanceof Error ? e.message : "No se pudo guardar");
      }
    });
  }

  return (
    <fieldset disabled={pending}>
      <legend className="text-sm font-medium">Precio en el punto de venta</legend>
      <p className="mb-2 mt-1 text-xs text-muted-foreground">
        Qué número muestra cada tarjeta. Es tuyo: no cambia lo que ven los demás.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ["venta", "Precio de venta", "Lo que le cobras al cliente."],
            ["costo", "Costo", "Lo que te costó. Visible a quien esté frente al mostrador."],
          ] as const
        ).map(([valor, titulo, detalle]) => (
          <label
            key={valor}
            className={cn(
              "flex cursor-pointer gap-2.5 rounded-lg border p-3 transition-colors",
              base === valor ? "border-ring bg-muted" : "border-border hover:border-ring/40",
              pending && "cursor-not-allowed opacity-70",
            )}
          >
            <input
              type="radio"
              name="precio-base-pos"
              value={valor}
              checked={base === valor}
              onChange={() => elegir(valor)}
              className="mt-0.5 h-4 w-4 accent-[hsl(var(--brand))]"
            />
            <span>
              <span className="block text-sm font-medium">{titulo}</span>
              <span className="block text-xs text-muted-foreground">{detalle}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
