"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMXN } from "@/lib/money";
import { BancoIcon } from "@/components/ui/cuenta";
import { listarTerminales } from "@/modules/config/terminales";
import { comisionCents, comisionEfectiva, textoComision, type Terminal } from "@/lib/terminales";

const LS_TERMINAL = "pos_terminal_v1";

/** Card terminals, fetched once per mount. Null while loading. */
export function useTerminales(): Terminal[] | null {
  const [t, setT] = useState<Terminal[] | null>(null);
  useEffect(() => {
    listarTerminales().then(setT).catch(() => setT([]));
  }, []);
  return t;
}

/**
 * The chosen terminal, preselected each time `reinicio` changes (a new charge):
 * the last one this device used, or the only one there is.
 */
export function useTerminalElegida(terminales: Terminal[] | null, reinicio: unknown) {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    if (!terminales?.length) return;
    let ultima: string | null = null;
    try {
      ultima = localStorage.getItem(LS_TERMINAL);
    } catch {
      // Blocked storage: no memory, the counter picks.
    }
    setId(terminales.some((t) => t.id === ultima) ? ultima : terminales.length === 1 ? terminales[0].id : null);
  }, [terminales, reinicio]);
  return [id, setId] as const;
}

/** Remember the terminal this device just used. */
export function recordarTerminal(id: string | null) {
  if (!id) return;
  try {
    localStorage.setItem(LS_TERMINAL, id);
  } catch {
    // Not remembered; this charge still records it.
  }
}

/**
 * "¿En qué terminal se pasó?" — one tile per terminal. With `verComision`
 * (whoever may see costs) each tile says its rate and account, and the
 * commission and what lands in the account show under the list.
 */
export function TerminalPicker({
  terminales,
  value,
  onChange,
  montoCents,
  verComision = false,
}: {
  terminales: Terminal[];
  value: string | null;
  onChange: (id: string) => void;
  montoCents: number;
  verComision?: boolean;
}) {
  const terminal = terminales.find((t) => t.id === value) ?? null;
  const comision = terminal ? comisionCents(montoCents, comisionEfectiva(terminal)) : 0;
  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-sm font-semibold">¿En qué terminal se pasó?</p>
      <div className="grid gap-1.5">
        {terminales.map((t) => {
          const activa = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={activa}
              onClick={() => onChange(t.id)}
              className={cn(
                "flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl border bg-background px-3 py-2 text-left",
                activa ? "border-ring ring-1 ring-ring" : "border-border hover:border-ring/40",
              )}
            >
              <BancoIcon banco={t.procesador} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t.nombre}</span>
                {verComision && (
                  <span className="block text-xs text-muted-foreground">
                    {textoComision(t)}
                    {t.cuenta ? ` · deposita en ${t.cuenta.alias}` : ""}
                  </span>
                )}
              </span>
              {activa && <Check className="h-4 w-4 text-green-600 dark:text-green-400" />}
            </button>
          );
        })}
      </div>
      {verComision && terminal && comision > 0 && (
        <div className="space-y-1 rounded-lg bg-background px-3 py-2 text-sm">
          <div className="flex justify-between text-muted-foreground">
            <span>Comisión {terminal.nombre} ({textoComision(terminal)})</span>
            <span className="font-mono tabular-nums text-red-600 dark:text-red-400">−{formatMXN(comision)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>Llega{terminal.cuenta ? ` a ${terminal.cuenta.alias}` : ""}</span>
            <span className="font-mono tabular-nums">{formatMXN(montoCents - comision)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
