"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { saveNotifPrefs, type NotifPrefs as Prefs } from "./actions";

const EVENTS: { key: keyof Prefs; label: string; desc: string }[] = [
  { key: "venta", label: "Ventas", desc: "Cada venta nueva" },
  { key: "fiado", label: "Fiados", desc: "Cada fiado nuevo" },
  { key: "abono", label: "Abonos y cobros", desc: "Pagos a un fiado" },
  {
    key: "cancelacion",
    label: "Cancelaciones",
    desc: "Ventas anuladas y fiados cancelados",
  },
];

export function NotifPrefs({ initial }: { initial: Prefs }) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [pending, start] = useTransition();

  function toggle(key: keyof Prefs) {
    const prev = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    start(async () => {
      try {
        await saveNotifPrefs(next);
      } catch (e) {
        setPrefs(prev);
        toast.error(e instanceof Error ? e.message : "No se pudo guardar");
      }
    });
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        ¿Qué eventos quieres recibir?
      </p>
      <div className="divide-y divide-border rounded-lg border border-border">
        {EVENTS.map((ev) => (
          <div
            key={ev.key}
            className="flex items-center justify-between gap-3 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{ev.label}</p>
              <p className="text-xs text-muted-foreground">{ev.desc}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs[ev.key]}
              aria-label={ev.label}
              onClick={() => toggle(ev.key)}
              disabled={pending}
              className={cn(
                "relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60",
                prefs[ev.key] ? "bg-accent" : "bg-muted",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                  prefs[ev.key] ? "translate-x-[1.375rem]" : "translate-x-0.5",
                )}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
