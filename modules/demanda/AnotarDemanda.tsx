"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/components/use-is-mobile";
import { CustomerPicker, type PickerCustomer } from "@/modules/customers/CustomerPicker";
import { anotarDemanda, type DemandaReciente, type TipoPieza } from "./actions";

const TIPOS: [TipoPieza, string][] = [
  ["pantalla", "Pantalla"],
  ["bateria", "Batería"],
  ["tapa", "Tapa"],
  ["flex", "Flex"],
  ["otro", "Otro"],
];

const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * "Lo piden y no lo tenemos": the sale that didn't happen, written down while
 * the customer is still at the counter.
 *
 * The model comes pre-filled from whatever was searched, so the whole thing is
 * two taps; the hour, the branch and the seller are recorded without asking.
 */
export function AnotarDemanda({
  open,
  texto,
  productId = null,
  customers,
  onClose,
  recientes = [],
}: {
  open: boolean;
  /** What was searched (or the sold-out product's name). */
  texto: string;
  /** Set when the piece exists in the catalog and is simply at zero. */
  productId?: string | null;
  customers: PickerCustomer[];
  onClose: () => void;
  /** Times this same model was already asked for. */
  recientes?: DemandaReciente[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [modelo, setModelo] = useState(texto);
  const [tipo, setTipo] = useState<TipoPieza>("pantalla");
  const [qty, setQty] = useState(1);
  const [cliente, setCliente] = useState<PickerCustomer | null>(null);
  const [avisar, setAvisar] = useState(false);
  const [contacto, setContacto] = useState("");
  const [nota, setNota] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setModelo(texto);
    setTipo(productId ? "otro" : "pantalla");
    setQty(1);
    setCliente(null);
    setAvisar(false);
    setContacto("");
    setNota("");
  }, [open, texto, productId]);

  function guardar() {
    if (modelo.trim().length < 2) {
      toast.error("Escribe qué pidieron");
      return;
    }
    start(async () => {
      const r = await anotarDemanda({
        texto: modelo,
        tipo,
        qty,
        productId,
        customerId: cliente && !cliente.is_system ? cliente.id : null,
        contacto: avisar ? contacto || cliente?.telefono || null : null,
        nota,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Anotado · ${modelo.trim()}`, {
        description: "Entra al resurtido de Por surtir.",
      });
      onClose();
      router.refresh();
    });
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} swipeDirection={isMobile ? "down" : "right"} showSwipeHandle={isMobile}>
      <DrawerContent className="data-[swipe-direction=down]:top-16 data-[swipe-direction=down]:max-h-none data-[swipe-direction=right]:w-[min(520px,100vw)]">
        <div className="flex items-start justify-between px-4 pt-1 pb-3 sm:px-6 sm:pt-5">
          <div>
            <DrawerTitle className="text-lg font-semibold sm:text-xl">Lo piden y no lo tenemos</DrawerTitle>
            <p className="text-sm text-muted-foreground">Queda con la hora. Suma al resurtido.</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div data-base-ui-swipe-ignore className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">
          <label className="block space-y-2">
            <span className="text-sm font-semibold">¿Qué pidieron?</span>
            <Input
              value={modelo}
              onChange={(e) => setModelo(e.target.value)}
              placeholder="Modelo y pieza"
              className="h-12 text-base font-semibold"
            />
            <span className="text-xs text-muted-foreground">
              {productId
                ? "Está en el catálogo, pero en ceros: queda ligado a esa pieza."
                : "Viene de lo que buscaste. Corrígelo si el cliente lo dijo de otra forma."}
            </span>
          </label>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">¿Qué pieza?</legend>
            <div className="flex flex-wrap gap-2">
              {TIPOS.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={tipo === k}
                  onClick={() => setTipo(k)}
                  className={cn(
                    "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-sm sm:h-10",
                    tipo === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                  )}
                >
                  {tipo === k && <Check className="h-3.5 w-3.5" />}
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex items-end gap-3">
            <div className="space-y-2">
              <span className="block text-sm font-semibold">Piezas</span>
              <div className="flex h-12 items-center overflow-hidden rounded-xl border border-border">
                <button
                  type="button"
                  aria-label="Una menos"
                  onClick={() => setQty((n) => Math.max(1, n - 1))}
                  className="h-full w-11 cursor-pointer text-lg text-muted-foreground hover:bg-muted"
                >
                  −
                </button>
                <span className="w-12 text-center text-lg font-semibold tabular-nums">{qty}</span>
                <button
                  type="button"
                  aria-label="Una más"
                  onClick={() => setQty((n) => Math.min(999, n + 1))}
                  className="h-full w-11 cursor-pointer text-lg text-muted-foreground hover:bg-muted"
                >
                  +
                </button>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <span className="block text-sm font-semibold">
                ¿Quién lo pidió? <span className="font-normal text-muted-foreground">· opcional</span>
              </span>
              <CustomerPicker
                customers={customers}
                value={cliente}
                onChange={setCliente}
                placeholder="Mostrador"
                excludeSystem
                openUp={false}
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => setAvisar((v) => !v)}
              aria-pressed={avisar}
              className={cn(
                "flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left text-sm",
                avisar ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30" : "border-border",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                  avisar ? "border-emerald-600 bg-emerald-600 text-white" : "border-border",
                )}
              >
                {avisar && <Check className="h-4 w-4" />}
              </span>
              <span className="flex-1">Avisarle cuando llegue</span>
            </button>
            {avisar && (
              <Input
                value={contacto || cliente?.telefono || ""}
                onChange={(e) => setContacto(e.target.value)}
                inputMode="tel"
                placeholder="Teléfono para avisar"
                className="h-11 text-base sm:text-sm"
              />
            )}
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              Nota <span className="font-normal text-muted-foreground">· opcional</span>
            </span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="Color, calidad, urgencia…"
              className="w-full resize-none rounded-xl border border-border bg-background p-3 text-base outline-hidden focus:ring-2 focus:ring-ring/30 sm:text-sm"
            />
          </label>

          {recientes.length > 0 && (
            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Ya lo habían pedido {recientes.length === 1 ? "una vez" : `${recientes.length} veces`}
              </p>
              <ul className="space-y-1.5">
                {recientes.map((r) => (
                  <li key={r.id} className="text-xs text-muted-foreground tabular-nums">
                    {hora(r.created_at)}
                    {r.quien && ` · ${r.quien}`}
                    {r.sucursal && ` · ${r.sucursal}`}
                    {r.cliente && ` · ${r.cliente}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex gap-2.5 border-t border-border px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <Button variant="secondary" className="hidden h-12 flex-1 sm:inline-flex" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button className="h-13 flex-2 text-base sm:h-12" onClick={guardar} loading={pending}>
            <Check className="h-5 w-5" />
            Anotar pedido
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
