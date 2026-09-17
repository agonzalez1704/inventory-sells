"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Minus, Plus, Search, X } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/components/use-is-mobile";
import { registrarConteo } from "./cuadre-actions";

const BILLETES = [1000, 500, 200, 100, 50, 20] as const;

export type PistaConteo = { titulo: string; detalle: string; montoCents: number };

/**
 * Count the drawer: bill by bill (or the total typed), against what there
 * should be. `esperadoCents` null = a blind count (the person can't see the
 * corte): they enter what's there and never see the expected amount.
 */
export function ContarEfectivo({
  open,
  onClose,
  tipo,
  fecha,
  fechaLabel,
  sucursalId,
  sucursalNombre,
  esperadoCents,
  fondoSugeridoCents,
  pistas = [],
}: {
  open: boolean;
  onClose: () => void;
  tipo: "conteo" | "cierre";
  fecha: string;
  fechaLabel: string;
  sucursalId: string | null;
  sucursalNombre: string | null;
  esperadoCents: number | null;
  fondoSugeridoCents: number;
  /** Things that could explain a difference; one matching it is suggested. */
  pistas?: PistaConteo[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [cuenta, setCuenta] = useState<Record<number, number>>({});
  const [monedas, setMonedas] = useState("");
  const [total, setTotal] = useState<string | null>(null);
  const [nota, setNota] = useState("");
  const [fondo, setFondo] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setCuenta({});
    setMonedas("");
    setTotal(null);
    setNota("");
    setFondo(String(fondoSugeridoCents / 100));
  }, [open, fondoSugeridoCents]);

  const monedasCents = Math.round((Number(monedas) || 0) * 100);
  const contadoCents =
    total != null
      ? Math.round((Number(total) || 0) * 100)
      : BILLETES.reduce((s, b) => s + (cuenta[b] ?? 0) * b * 100, 0) + monedasCents;
  const tocado = total != null ? total !== "" : Object.values(cuenta).some(Boolean) || monedas !== "";
  const dif = esperadoCents != null && tocado ? contadoCents - esperadoCents : null;
  const pista = useMemo(
    () => (dif ? pistas.find((p) => Math.abs(p.montoCents) === Math.abs(dif)) : undefined),
    [dif, pistas],
  );

  function guardar() {
    start(async () => {
      const r = await registrarConteo({
        fecha,
        sucursalId,
        tipo,
        desglose: Object.fromEntries(BILLETES.map((b) => [String(b), cuenta[b] ?? 0])),
        monedasCents,
        totalCents: total != null ? contadoCents : null,
        nota: nota || null,
        fondoSiguienteCents: tipo === "cierre" ? Math.round((Number(fondo) || 0) * 100) : null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const d = r.data.diferenciaCents;
      toast.success(
        tipo === "cierre" ? "Día cerrado" : "Conteo guardado",
        d == null
          ? undefined
          : { description: d === 0 ? "La caja cuadra" : d < 0 ? `Faltan ${formatMXN(-d)}` : `Sobran ${formatMXN(d)}` },
      );
      onClose();
      router.refresh();
    });
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      swipeDirection={isMobile ? "down" : "right"}
      showSwipeHandle={isMobile}
    >
      <DrawerContent className="data-[swipe-direction=down]:top-12 data-[swipe-direction=down]:max-h-none data-[swipe-direction=right]:w-[min(460px,100vw)]">
        <div className="flex items-start justify-between px-4 pb-1 pt-3 sm:px-6 sm:pt-5">
          <div>
            <DrawerTitle className="text-lg font-semibold sm:text-xl">
              {tipo === "cierre" ? "Cerrar el día" : "Contar efectivo"}
            </DrawerTitle>
            <p className="text-sm text-muted-foreground">
              {fechaLabel}
              {sucursalNombre && ` · ${sucursalNombre}`}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div data-base-ui-swipe-ignore className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3 sm:px-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{total == null ? "Cuenta el efectivo" : "Total en el cajón"}</p>
              <button
                type="button"
                onClick={() => setTotal(total == null ? "" : null)}
                className="h-9 cursor-pointer text-sm font-medium text-amber-700 hover:underline dark:text-amber-400"
              >
                {total == null ? "Escribir el total" : "Contar billetes"}
              </button>
            </div>

            {total != null ? (
              <div className="flex h-16 items-center gap-2 rounded-xl border-2 border-foreground px-4">
                <span className="text-2xl text-muted-foreground">$</span>
                <input
                  autoFocus
                  inputMode="decimal"
                  value={total}
                  onChange={(e) => setTotal(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="0.00"
                  aria-label="Total contado"
                  className="w-full min-w-0 bg-transparent text-3xl font-semibold tabular-nums outline-none"
                />
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                {BILLETES.map((b) => {
                  const n = cuenta[b] ?? 0;
                  const set = (v: number) => setCuenta((c) => ({ ...c, [b]: Math.max(0, v) }));
                  return (
                    <div key={b} className="flex h-14 items-center gap-3 border-b border-border/70 px-3 last:border-0">
                      <span className="w-14 text-[15px] font-semibold tabular-nums">${b.toLocaleString("en-US")}</span>
                      <div className="flex h-11 items-center overflow-hidden rounded-lg border border-border">
                        <button
                          type="button"
                          aria-label={`Un billete de ${b} menos`}
                          disabled={!n}
                          onClick={() => set(n - 1)}
                          className="flex h-full w-11 cursor-pointer items-center justify-center hover:bg-muted disabled:opacity-30"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <input
                          inputMode="numeric"
                          aria-label={`Billetes de ${b}`}
                          value={n || ""}
                          placeholder="0"
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => set(Number(e.target.value.replace(/\D/g, "").slice(0, 4)))}
                          className="w-10 bg-transparent text-center text-base font-semibold tabular-nums outline-none"
                        />
                        <button
                          type="button"
                          aria-label={`Un billete de ${b} más`}
                          onClick={() => set(n + 1)}
                          className="flex h-full w-11 cursor-pointer items-center justify-center hover:bg-muted"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <span className="flex-1 text-right text-sm tabular-nums text-muted-foreground">
                        {n ? formatMXN(n * b * 100) : ""}
                      </span>
                    </div>
                  );
                })}
                <div className="flex h-14 items-center gap-3 px-3">
                  <span className="w-14 text-sm font-semibold">Monedas</span>
                  <div className="flex h-11 w-32 items-center gap-1 rounded-lg border border-border px-3">
                    <span className="text-muted-foreground">$</span>
                    <input
                      inputMode="decimal"
                      aria-label="Monedas"
                      value={monedas}
                      onChange={(e) => setMonedas(e.target.value.replace(/[^\d.]/g, ""))}
                      placeholder="0"
                      className="w-full min-w-0 bg-transparent text-base tabular-nums outline-none"
                    />
                  </div>
                  <span className="flex-1 text-right text-sm font-semibold tabular-nums">{formatMXN(contadoCents)}</span>
                </div>
              </div>
            )}
          </div>

          {esperadoCents != null ? (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="flex h-11 items-center px-3.5 text-sm">
                <span className="flex-1 text-muted-foreground">Debería haber</span>
                <span className="font-semibold tabular-nums">{formatMXN(esperadoCents)}</span>
              </div>
              <div className="flex h-11 items-center border-t border-border/70 px-3.5 text-sm">
                <span className="flex-1 text-muted-foreground">Contaste</span>
                <span className="font-semibold tabular-nums">{tocado ? formatMXN(contadoCents) : "—"}</span>
              </div>
              {dif != null && (
                <div
                  className={cn(
                    "flex h-12 items-center border-t px-3.5",
                    dif === 0
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
                  )}
                >
                  <span className="flex-1 font-semibold">{dif === 0 ? "Cuadra" : dif < 0 ? "Faltan" : "Sobran"}</span>
                  <span className="text-xl font-bold tabular-nums">
                    {dif === 0 ? "✓" : `${dif < 0 ? "−" : "+"}${formatMXN(Math.abs(dif))}`}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="rounded-xl bg-muted/50 px-3.5 py-3 text-sm text-muted-foreground">
              Cuenta lo que hay en el cajón. Quien revisa el corte verá si cuadra.
            </p>
          )}

          {pista && (
            <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
              <Search className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
              <p>
                <b>Posible causa: {pista.titulo}</b>
                <br />
                {pista.detalle}
              </p>
            </div>
          )}

          <div className={cn("grid gap-3", tipo === "cierre" && "grid-cols-[minmax(0,1fr)_8.5rem]")}>
            <label className="space-y-1.5">
              <span className="text-sm font-semibold">
                Nota <span className="font-normal text-muted-foreground">· opcional</span>
              </span>
              <input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                maxLength={500}
                placeholder="Ej. se dio cambio de más"
                className="h-11 w-full rounded-lg border border-border bg-background px-3 text-base outline-none focus:ring-2 focus:ring-ring/30 sm:text-sm"
              />
            </label>
            {tipo === "cierre" && (
              <label className="space-y-1.5">
                <span className="text-sm font-semibold">Fondo para mañana</span>
                <div className="flex h-11 items-center gap-1 rounded-lg border border-border px-3">
                  <span className="text-muted-foreground">$</span>
                  <input
                    inputMode="decimal"
                    value={fondo}
                    onChange={(e) => setFondo(e.target.value.replace(/[^\d.]/g, ""))}
                    className="w-full min-w-0 bg-transparent text-base tabular-nums outline-none sm:text-sm"
                  />
                </div>
              </label>
            )}
          </div>
          {tipo === "cierre" && (
            <p className="text-xs text-muted-foreground">
              El fondo es el efectivo que se queda en el cajón para abrir mañana; lo demás se retira.
            </p>
          )}
        </div>

        <div className="flex gap-2.5 border-t border-border px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
          <Button variant="secondary" className="hidden h-12 flex-1 sm:inline-flex" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button className="h-12 flex-[1.6] text-base sm:text-sm" onClick={guardar} loading={pending} disabled={!tocado}>
            {tipo === "conteo"
              ? "Guardar conteo"
              : dif == null || dif === 0
                ? "Cerrar el día"
                : `Cerrar con ${dif < 0 ? "faltante" : "sobrante"} de ${formatMXN(Math.abs(dif))}`}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
