"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Landmark, Plus, Archive } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/errors";
import { BANCOS, BancoIcon, type Cuenta } from "@/components/ui/cuenta";
import { crearCuenta, archivarCuenta } from "./cuentas";

/**
 * "Cuentas del negocio": register each account transfers can land in. The bank
 * grid is the whole form — tap the bank, name the account, done. Once at least
 * one exists, every transfer flow grows a "¿a cuál cuenta llegó?" picker.
 */
export function CuentasNegocio({ cuentas, isAdmin }: { cuentas: Cuenta[]; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [banco, setBanco] = useState<string | null>(null);
  const [alias, setAlias] = useState("");

  function crear() {
    start(async () => {
      try {
        unwrap(await crearCuenta(banco ?? "", alias));
        toast.success(`Cuenta "${alias.trim()}" registrada`);
        setBanco(null);
        setAlias("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo crear");
      }
    });
  }

  function archivar(c: Cuenta) {
    start(async () => {
      try {
        unwrap(await archivarCuenta(c.id));
        toast.success(`"${c.alias}" archivada`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo archivar");
      }
    });
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
          <Landmark className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Cuentas del negocio</h2>
          <p className="text-xs text-muted-foreground">
            Al registrar un pago por transferencia se podrá elegir a cuál de
            estas cuentas llegó.
          </p>
        </div>
      </div>

      {cuentas.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
          {cuentas.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2">
              <BancoIcon banco={c.banco} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{c.alias}</span>
                <span className="block text-xs text-muted-foreground">
                  {BANCOS[c.banco]?.nombre ?? c.banco}
                </span>
              </span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => archivar(c)}
                  disabled={pending}
                  aria-label={`Archivar ${c.alias}`}
                  className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600"
                >
                  <Archive className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <fieldset className="mt-3" disabled={pending}>
          <span className="mb-1.5 block text-xs font-medium text-muted-foreground">Banco</span>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(BANCOS).map(([key, b]) => (
              <button
                key={key}
                type="button"
                onClick={() => setBanco(banco === key ? null : key)}
                aria-pressed={banco === key}
                title={b.nombre}
                className={cn(
                  "cursor-pointer rounded-xl border p-1 transition-colors",
                  banco === key ? "border-ring bg-muted" : "border-border hover:border-ring/40",
                )}
              >
                <BancoIcon banco={key} size="lg" />
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="block min-w-48 flex-1">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Alias</span>
              <Input
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder={banco ? `${BANCOS[banco].nombre} Antonio` : "BBVA Antonio"}
              />
            </label>
            <Button type="button" onClick={crear} loading={pending} disabled={!banco || !alias.trim()}>
              <Plus className="h-4 w-4" />
              Agregar
            </Button>
          </div>
        </fieldset>
      )}
    </Card>
  );
}
