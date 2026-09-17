"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRight, Camera, Check, Minus, Plus, X } from "lucide-react";
import { foto as urlFoto } from "@/lib/foto";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/components/use-is-mobile";
import { ajustarStock, deshacerAjuste, type MotivoAjuste } from "./panel-actions";

const MOTIVOS: [MotivoAjuste, string][] = [
  ["conteo", "Conteo físico"],
  ["danada", "Pieza dañada"],
  ["robo", "Robo o faltante"],
  ["devolucion", "Devolución de cliente"],
  ["otro", "Otro"],
];

const piezas = (n: number) => `${n} ${Math.abs(n) === 1 ? "pieza" : "piezas"}`;

/**
 * "Nuevo ajuste", stacked over the product panel (approved mockup): pick why,
 * say how many are on the shelf, optional note. Saving shows a toast with
 * "Deshacer". Desktop: a narrower panel on the right. Phone: a bottom sheet.
 */
export function AjusteStock({
  open,
  producto,
  onClose,
  onAjustado,
}: {
  open: boolean;
  producto: { id: string; name: string; image_url: string | null; quantity: number; inventario: string | null };
  onClose: () => void;
  /** New quantity after saving or undoing. */
  onAjustado: (cantidad: number) => void;
}) {
  const enSistema = producto.quantity;
  const [motivo, setMotivo] = useState<MotivoAjuste>("conteo");
  const [contado, setContado] = useState(String(enSistema));
  const [nota, setNota] = useState("");
  const [pending, start] = useTransition();
  const isMobile = useIsMobile();
  const input = useRef<HTMLInputElement>(null);

  // Each opening starts from what the system says now.
  useEffect(() => {
    if (!open) return;
    setMotivo("conteo");
    setContado(String(producto.quantity));
    setNota("");
  }, [open, producto.id, producto.quantity]);

  const n = contado === "" ? null : Number(contado);
  const delta = n == null ? 0 : n - enSistema;
  const faltaNota = motivo === "otro" && !nota.trim();
  const puedeGuardar = n != null && delta !== 0 && !faltaNota;

  function guardar() {
    if (!puedeGuardar || n == null) return;
    start(async () => {
      const r = await ajustarStock(producto.id, n, enSistema, motivo, nota);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const { movimientoId, cantidad } = r.data;
      onAjustado(cantidad);
      onClose();
      toast.success(`${producto.name}: ${delta > 0 ? "+" : "−"}${piezas(Math.abs(delta))}, queda en ${cantidad}`, {
        duration: 10000,
        action: {
          label: "Deshacer",
          onClick: async () => {
            const u = await deshacerAjuste(movimientoId);
            if (!u.ok) {
              toast.error(u.error);
              return;
            }
            onAjustado(u.data);
            toast.success(`Ajuste deshecho: vuelve a ${u.data}`);
          },
        },
      });
    });
  }

  return (
    // Nested inside the product panel's drawer: the panel shrinks back behind it.
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      swipeDirection={isMobile ? "down" : "right"}
      showSwipeHandle={isMobile}
    >
      <DrawerContent
        overlay={false}
        // Desktop: straight to the count. Phone: the keyboard would hide the reasons.
        initialFocus={isMobile ? undefined : input}
        className="data-[swipe-direction=down]:top-16 data-[swipe-direction=down]:max-h-none data-[swipe-direction=right]:w-[min(440px,100vw)]"
      >
        <div className="flex items-center justify-between px-4 py-2.5 sm:px-6 sm:pt-5">
          <DrawerTitle className="text-lg font-semibold sm:text-xl">Nuevo ajuste</DrawerTitle>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div data-base-ui-swipe-ignore className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background">
              {producto.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urlFoto(producto.image_url, 128)} alt="" className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-5 w-5 text-muted-foreground/60" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{producto.name}</p>
              <p className="text-xs text-muted-foreground">
                {enSistema} en existencia{producto.inventario && ` · ${producto.inventario}`}
              </p>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">¿Por qué ajustas?</legend>
            <div className="flex flex-wrap gap-2">
              {MOTIVOS.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={motivo === k}
                  onClick={() => setMotivo(k)}
                  className={cn(
                    "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm sm:h-10",
                    motivo === k
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  {motivo === k && <Check className="h-3.5 w-3.5" />}
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <p className="text-sm font-semibold">¿Cuántas hay en realidad?</p>
            <div className="flex items-stretch gap-2.5">
              <div className="flex flex-1 flex-col justify-center rounded-xl border border-border bg-muted/30 px-3.5 py-2">
                <span className="text-xs text-muted-foreground">En sistema</span>
                <span className="text-2xl font-semibold tabular-nums">{enSistema}</span>
              </div>
              <ArrowRight className="h-5 w-5 self-center text-muted-foreground/60" />
              <div className="flex flex-[1.5] flex-col gap-1">
                <span className="pl-0.5 text-xs text-muted-foreground">Contaste</span>
                <div className="flex h-14 overflow-hidden rounded-xl border-2 border-foreground">
                  <button
                    type="button"
                    aria-label="Una menos"
                    disabled={n == null || n <= 0}
                    onClick={() => setContado(String(Math.max(0, (n ?? enSistema) - 1)))}
                    className="flex w-12 cursor-pointer items-center justify-center hover:bg-muted disabled:opacity-40"
                  >
                    <Minus className="h-5 w-5" />
                  </button>
                  <input
                    ref={input}
                    inputMode="numeric"
                    aria-label="Piezas contadas"
                    value={contado}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setContado(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                    onKeyDown={(e) => e.key === "Enter" && guardar()}
                    className="w-full min-w-0 flex-1 bg-transparent text-center text-2xl font-semibold tabular-nums outline-hidden"
                  />
                  <button
                    type="button"
                    aria-label="Una más"
                    onClick={() => setContado(String((n ?? enSistema) + 1))}
                    className="flex w-12 cursor-pointer items-center justify-center hover:bg-muted"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>
            <p className="min-h-5 text-sm">
              {delta === 0 ? (
                <span className="text-muted-foreground">Igual que en sistema: cambia la cantidad para ajustar.</span>
              ) : (
                <>
                  <span
                    className={cn(
                      "font-semibold",
                      delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                    )}
                  >
                    {delta > 0 ? "+" : "−"}
                    {piezas(Math.abs(delta))}
                  </span>
                  <span className="text-muted-foreground"> · queda en {n}</span>
                </>
              )}
            </p>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              Nota{" "}
              <span className="font-normal text-muted-foreground">
                · {motivo === "otro" ? "obligatoria con “Otro”" : "opcional"}
              </span>
            </span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ej. faltó una al contar el cajón B"
              className="w-full resize-none rounded-xl border border-border bg-background p-3 text-base outline-hidden focus:ring-2 focus:ring-ring/30 sm:text-sm"
            />
          </label>
        </div>

        <div className="flex gap-2.5 border-t border-border px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
          <Button variant="secondary" className="hidden h-12 flex-1 sm:inline-flex" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button className="h-12 flex-2 text-base sm:text-sm" onClick={guardar} loading={pending} disabled={!puedeGuardar}>
            Guardar ajuste{n != null && delta !== 0 && ` · queda en ${n}`}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
