"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CreditCard, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/use-confirm";
import { BancoIcon, CuentaPicker } from "@/components/ui/cuenta";
import { BANCOS, type Cuenta } from "@/lib/bancos";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { comisionCents, comisionEfectiva, textoComision, type Terminal } from "@/lib/terminales";
import { archivarTerminal, guardarTerminal } from "./terminales";

// The processors a Mexican counter actually has on the desk; "otro" covers the rest.
const PROCESADORES = ["clip", "mercadopago", "bbva", "banorte", "santander", "getnet", "otro"] as const;

type Borrador = {
  id: string | null;
  nombre: string;
  procesador: string;
  comision: string;
  iva: boolean;
  cuentaId: string | null;
};

const NUEVA: Borrador = { id: null, nombre: "", procesador: "clip", comision: "", iva: true, cuentaId: null };

/**
 * Card terminals in Configuración: name, processor, commission and the account
 * it deposits into. The register asks which terminal took each card payment,
 * and the corte turns that into commission and "debe llegar" per account.
 */
export function TerminalesConfig({ terminales, cuentas }: { terminales: Terminal[]; cuentas: Cuenta[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirmar, dialogoConfirm] = useConfirm();
  const [borrador, setBorrador] = useState<Borrador | null>(null);

  const pct = Number((borrador?.comision ?? "").replace(",", "."));
  const pctValido = borrador !== null && borrador.comision.trim() !== "" && Number.isFinite(pct) && pct >= 0 && pct < 100;
  const ejemplo = pctValido ? comisionCents(100000, comisionEfectiva({ comision_pct: pct, iva_comision: borrador.iva })) : null;
  const cuentaEjemplo = cuentas.find((c) => c.id === borrador?.cuentaId);

  function guardar() {
    if (!borrador || !pctValido) return;
    start(async () => {
      const r = await guardarTerminal({
        id: borrador.id,
        nombre: borrador.nombre,
        procesador: borrador.procesador,
        comisionPct: pct,
        ivaComision: borrador.iva,
        cuentaId: borrador.cuentaId,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(borrador.id ? "Terminal actualizada" : "Terminal agregada");
      setBorrador(null);
      router.refresh();
    });
  }

  async function archivar(t: Terminal) {
    if (!(await confirmar({ title: `¿Quitar ${t.nombre}?`, description: "Los cobros pasados conservan su terminal y su comisión.", confirmLabel: "Quitar", tone: "danger" })))
      return;
    start(async () => {
      const r = await archivarTerminal(t.id);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Terminal quitada");
      router.refresh();
    });
  }

  return (
    <Card className="p-4">
      {dialogoConfirm}
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
          <CreditCard className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Terminales de pago con tarjeta</h2>
          <p className="text-xs text-muted-foreground">
            Cada cobro con tarjeta se registra en una terminal: el corte descuenta su comisión y dice a qué cuenta
            llega el dinero.
          </p>
        </div>
        <Button size="sm" onClick={() => setBorrador({ ...NUEVA, cuentaId: cuentas[0]?.id ?? null })}>
          <Plus className="h-4 w-4" />
          Agregar terminal
        </Button>
      </div>

      {terminales.length > 0 && (
        <ul className="mt-3 divide-y divide-border/70 overflow-hidden rounded-xl border border-border">
          {terminales.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
              <BancoIcon banco={t.procesador} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{t.nombre}</span>
                <span className="block text-xs text-muted-foreground">
                  {textoComision(t)} · {t.cuenta ? `deposita en ${t.cuenta.alias}` : "sin cuenta ligada"}
                </span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Editar ${t.nombre}`}
                onClick={() =>
                  setBorrador({
                    id: t.id,
                    nombre: t.nombre,
                    procesador: t.procesador,
                    comision: String(t.comision_pct),
                    iva: t.iva_comision,
                    cuentaId: t.cuenta?.id ?? null,
                  })
                }
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" aria-label={`Quitar ${t.nombre}`} disabled={pending} onClick={() => archivar(t)}>
                <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={borrador !== null}
        onClose={() => setBorrador(null)}
        title={borrador?.id ? "Editar terminal" : "Agregar terminal"}
        className="max-w-md"
      >
        {borrador && (
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Nombre</span>
              <Input
                autoFocus
                value={borrador.nombre}
                onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
                placeholder="Clip mostrador, Point Panorama…"
              />
              <span className="block text-xs text-muted-foreground">Como la llaman en el mostrador: así aparece al cobrar.</span>
            </label>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Banco o procesador</span>
              <div className="grid grid-cols-4 gap-1.5">
                {PROCESADORES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={borrador.procesador === p}
                    onClick={() => setBorrador({ ...borrador, procesador: p })}
                    className={cn(
                      "flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border text-[11px] font-medium",
                      borrador.procesador === p ? "border-ring bg-muted" : "border-border hover:border-ring/40",
                    )}
                  >
                    <BancoIcon banco={p} size="sm" />
                    {BANCOS[p]?.nombre ?? p}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Comisión</span>
                <span className="flex h-10 items-center gap-1.5 rounded-lg border border-border bg-background px-3 focus-within:border-ring">
                  <input
                    inputMode="decimal"
                    value={borrador.comision}
                    onChange={(e) => setBorrador({ ...borrador, comision: e.target.value })}
                    placeholder="3.6"
                    className="w-full min-w-0 bg-transparent font-mono text-base outline-hidden lg:text-sm"
                  />
                  <span className="text-muted-foreground">%</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-end gap-2 pb-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={borrador.iva}
                  onChange={(e) => setBorrador({ ...borrador, iva: e.target.checked })}
                  className="h-4 w-4 accent-primary"
                />
                Cobra IVA sobre la comisión
              </label>
            </div>

            {cuentas.length > 0 ? (
              <CuentaPicker
                cuentas={cuentas}
                value={borrador.cuentaId}
                onChange={(id) => setBorrador({ ...borrador, cuentaId: id })}
                label="¿A qué cuenta deposita?"
              />
            ) : (
              <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                Registra primero tus cuentas en "Cuentas del negocio" para saber a dónde llega el dinero de cada terminal.
              </p>
            )}

            {ejemplo !== null && (
              <p className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-sm">
                Ejemplo: un cobro de <b>{formatMXN(100000)}</b> deja{" "}
                <b className="font-mono">{formatMXN(100000 - ejemplo)}</b>
                {cuentaEjemplo ? ` en ${cuentaEjemplo.alias}` : ""} (comisión {formatMXN(ejemplo)}).
              </p>
            )}

            <Button className="h-11 w-full" disabled={pending || !pctValido || borrador.nombre.trim().length < 2} onClick={guardar}>
              {pending ? "Guardando…" : "Guardar terminal"}
            </Button>
          </div>
        )}
      </Modal>
    </Card>
  );
}
