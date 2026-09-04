"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Landmark, Plus, Archive, Copy, Check, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/errors";
import { BancoIcon } from "@/components/ui/cuenta";
import { bancoDeClabe, validarClabe } from "@/lib/bancos";
import { crearCuenta, archivarCuenta, type CuentaAdmin } from "./cuentas";

// CLABE blocks: bank(3) plaza(3) cuenta(11) control(1) — spacing them makes an
// 18-digit paste readable at a glance.
const agrupar = (d: string) =>
  [d.slice(0, 3), d.slice(3, 6), d.slice(6, 17), d.slice(17, 18)].filter(Boolean).join(" ");

/**
 * "Cuentas del negocio": paste the CLABE and the bank names itself — the first
 * 3 digits ARE the bank, and the check digit rejects typos before saving.
 */
export function CuentasNegocio({ cuentas, isAdmin }: { cuentas: CuentaAdmin[]; isAdmin: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [clabe, setClabe] = useState("");
  const [alias, setAlias] = useState("");
  const [copiada, setCopiada] = useState<string | null>(null);

  const digitos = clabe.replace(/\D/g, "");
  const banco = bancoDeClabe(digitos);
  const completa = digitos.length === 18;
  const valida = completa && validarClabe(digitos);
  const aliasSugerido = banco && valida ? `${banco.nombre} ·${digitos.slice(-4)}` : "";

  function crear() {
    start(async () => {
      try {
        unwrap(await crearCuenta(digitos, alias));
        toast.success(`Cuenta "${alias.trim() || aliasSugerido}" registrada`);
        setClabe("");
        setAlias("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo crear");
      }
    });
  }

  function archivar(c: CuentaAdmin) {
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

  async function copiar(c: CuentaAdmin) {
    if (!c.clabe) return;
    await navigator.clipboard.writeText(c.clabe).catch(() => undefined);
    setCopiada(c.id);
    setTimeout(() => setCopiada(null), 1500);
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
            <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
              <BancoIcon banco={c.banco} size="lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.alias}</span>
                {c.clabe && (
                  <span className="block font-mono text-xs tabular-nums text-muted-foreground">
                    {agrupar(c.clabe)}
                  </span>
                )}
              </span>
              {c.clabe && (
                <button
                  type="button"
                  onClick={() => copiar(c)}
                  aria-label={`Copiar CLABE de ${c.alias}`}
                  className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {copiada === c.id ? (
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              )}
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
        <fieldset className="mt-4 space-y-2" disabled={pending}>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              CLABE (18 dígitos) — el banco se detecta solo
            </span>
            <Input
              value={agrupar(digitos)}
              onChange={(e) => setClabe(e.target.value.replace(/\D/g, "").slice(0, 18))}
              inputMode="numeric"
              placeholder="012 180 01234567890 1"
              className="font-mono tabular-nums"
            />
          </label>

          {digitos.length >= 3 && (
            <div
              className={cn(
                "flex items-center gap-2.5 rounded-xl border p-2.5",
                valida
                  ? "border-green-300/60 bg-green-50 dark:border-green-800/60 dark:bg-green-950/30"
                  : completa
                    ? "border-red-300/60 bg-red-50 dark:border-red-800/60 dark:bg-red-950/30"
                    : "border-border bg-muted/40",
              )}
            >
              {completa && !valida ? (
                <>
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                  <span className="text-sm text-red-700 dark:text-red-300">
                    La CLABE no cuadra — revisa los dígitos.
                  </span>
                </>
              ) : (
                <>
                  <BancoIcon banco={banco!.banco} size="lg" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{banco!.nombre}</span>
                    <span className="block text-xs text-muted-foreground">
                      {valida ? "CLABE verificada ✓" : `${digitos.length}/18 dígitos`}
                    </span>
                  </span>
                </>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-2">
            <label className="block min-w-48 flex-1">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                Alias (opcional)
              </span>
              <Input
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder={aliasSugerido || "BBVA Antonio"}
              />
            </label>
            <Button type="button" onClick={crear} loading={pending} disabled={!valida}>
              <Plus className="h-4 w-4" />
              Agregar
            </Button>
          </div>
        </fieldset>
      )}
    </Card>
  );
}
