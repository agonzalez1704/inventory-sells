"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { BANCOS, type Cuenta } from "@/lib/bancos";

export { BANCOS, CLABE_CODIGOS, validarClabe, bancoDeClabe, type Cuenta } from "@/lib/bancos";

// Mexican banks the shop may hold accounts at. No hotlinked logos: each bank
// renders as a rounded tile in its brand color with its short mark — instantly
// recognizable at the counter, zero external assets, works offline.
export function BancoIcon({ banco, size = "md" }: { banco: string; size?: "sm" | "md" | "lg" }) {
  const b = BANCOS[banco] ?? BANCOS.otro;
  const px = size === "lg" ? "h-10 w-10 text-sm" : size === "sm" ? "h-6 w-6 text-[9px]" : "h-8 w-8 text-[11px]";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-lg font-bold tracking-tight", px)}
      style={{ backgroundColor: b.bg, color: b.fg }}
      aria-hidden
    >
      {b.marca}
    </span>
  );
}

/** Read-only badge: which account a transfer landed in. */
export function CuentaChip({ cuenta, className }: { cuenta: Cuenta; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-foreground", className)}>
      <BancoIcon banco={cuenta.banco} size="sm" />
      {cuenta.alias}
    </span>
  );
}

/**
 * "¿A cuál cuenta te transfirieron?" — a row of the shop's accounts as bank
 * tiles. Renders NOTHING when the shop has no accounts registered, so every
 * existing flow keeps working untouched until Configuración fills the list.
 * Tapping the selected one deselects (the choice is optional).
 */
export function CuentaPicker({
  cuentas,
  value,
  onChange,
  label = "¿A cuál cuenta llegó?",
  disabled,
}: {
  cuentas: Cuenta[];
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
  disabled?: boolean;
}) {
  if (cuentas.length === 0) return null;
  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {cuentas.map((c) => {
          const activo = value === c.id;
          return (
            <button
              key={c.id}
              type="button"
              disabled={disabled}
              onClick={() => onChange(activo ? null : c.id)}
              aria-pressed={activo}
              className={cn(
                "relative flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-1.5 text-sm font-medium transition-colors",
                activo
                  ? "border-ring bg-muted"
                  : "border-border hover:border-ring/40 disabled:opacity-60",
              )}
            >
              <BancoIcon banco={c.banco} />
              {c.alias}
              {activo && <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Fetch-on-mount variant for spots where threading the list down is noise. */
export function useCuentas(): Cuenta[] {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  useEffect(() => {
    import("@/modules/config/cuentas").then(({ listarCuentas }) =>
      listarCuentas().then(setCuentas).catch(() => undefined),
    );
  }, []);
  return cuentas;
}
