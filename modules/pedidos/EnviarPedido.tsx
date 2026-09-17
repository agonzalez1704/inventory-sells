"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, MessageCircle, X } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/components/use-is-mobile";
import { avanzarPedido } from "./actions";
import { waLink, type PedidoWeb } from "./PedidosView";

const PAQUETERIAS = ["Estafeta", "DHL", "FedEx", "99minutos", "Paquetexpress", "Otra"];

/**
 * Ship a paid order: which carrier, the tracking number and what the label
 * really cost (the only way to know if the shipping charged covered it), plus
 * the WhatsApp message the customer expects.
 */
export function EnviarPedido({ open, pedido, onClose }: { open: boolean; pedido: PedidoWeb; onClose: () => void }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [paqueteria, setPaqueteria] = useState(PAQUETERIAS[0]);
  const [otra, setOtra] = useState("");
  const [numero, setNumero] = useState("");
  const [costo, setCosto] = useState("");
  const [avisar, setAvisar] = useState(true);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    setPaqueteria(PAQUETERIAS[0]);
    setOtra("");
    setNumero("");
    setCosto("");
    setAvisar(true);
  }, [open]);

  const empresa = paqueteria === "Otra" ? otra.trim() : paqueteria;
  const listo = empresa.length > 0 && numero.trim().length >= 4;
  const mensaje = `Hola ${pedido.nombre}, tu pedido ${pedido.folio} va en camino por ${empresa || "paquetería"}. Tu guía: ${numero || "—"}.`;

  function guardar() {
    if (!listo) return;
    start(async () => {
      const pesos = Number(costo.replace(",", "."));
      const r = await avanzarPedido(pedido.id, "enviado", {
        paqueteria: empresa,
        numero,
        costo_cents: Number.isFinite(pesos) && pesos > 0 ? Math.round(pesos * 100) : null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${pedido.folio} enviado`);
      if (avisar) window.open(waLink(pedido.telefono, mensaje), "_blank");
      onClose();
      router.refresh();
    });
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} swipeDirection={isMobile ? "down" : "right"} showSwipeHandle={isMobile}>
      <DrawerContent
        overlay={false}
        className="data-[swipe-direction=down]:top-16 data-[swipe-direction=down]:max-h-none data-[swipe-direction=right]:w-[min(440px,100vw)]"
      >
        <div className="flex items-start justify-between px-4 py-2.5 sm:px-6 sm:pt-5">
          <div>
            <DrawerTitle className="text-lg font-semibold sm:text-xl">Enviar pedido</DrawerTitle>
            <p className="text-sm text-muted-foreground">
              {pedido.folio}
              {pedido.municipio && ` · ${pedido.municipio}, ${pedido.estado ?? ""}`}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div data-base-ui-swipe-ignore className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">Paquetería</legend>
            <div className="flex flex-wrap gap-2">
              {PAQUETERIAS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={paqueteria === p}
                  onClick={() => setPaqueteria(p)}
                  className={cn(
                    "inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm sm:h-10",
                    paqueteria === p ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                  )}
                >
                  {paqueteria === p && <Check className="h-3.5 w-3.5" />}
                  {p}
                </button>
              ))}
            </div>
            {paqueteria === "Otra" && (
              <Input autoFocus value={otra} onChange={(e) => setOtra(e.target.value)} placeholder="¿Cuál?" className="h-11 text-base sm:text-sm" />
            )}
            {pedido.envio_desc && (
              <p className="text-xs text-muted-foreground">
                Al cliente se le cotizó {pedido.envio_desc}
                {pedido.envio_cents ? ` · ${formatMXN(pedido.envio_cents)}` : ""}
              </p>
            )}
          </fieldset>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">Número de guía</span>
            <Input
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="7011 2233 4455"
              className="h-12 font-mono text-base"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-semibold">
              Lo que costó la guía <span className="font-normal text-muted-foreground">· opcional</span>
            </span>
            <div className="flex h-11 items-center gap-1 rounded-lg border border-border px-3">
              <span className="text-muted-foreground">$</span>
              <input
                inputMode="decimal"
                value={costo}
                onChange={(e) => setCosto(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="0.00"
                className="w-full min-w-0 bg-transparent text-base tabular-nums outline-hidden sm:text-sm"
              />
            </div>
            <span className="text-xs text-muted-foreground">Para saber si el envío que cobraste alcanzó.</span>
          </label>

          <button
            type="button"
            onClick={() => setAvisar(!avisar)}
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
            <span className="flex-1">Avisar al cliente por WhatsApp con su guía</span>
            <MessageCircle className="h-5 w-5 text-emerald-600" />
          </button>
          {avisar && <p className="rounded-xl bg-muted/50 p-3 text-sm leading-relaxed">{mensaje}</p>}
        </div>

        <div className="flex gap-2.5 border-t border-border px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
          <Button variant="secondary" className="hidden h-12 flex-1 sm:inline-flex" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button className="h-12 flex-2 text-base sm:text-sm" onClick={guardar} loading={pending} disabled={!listo}>
            {avisar ? "Marcar enviado y avisar" : "Marcar enviado"}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
