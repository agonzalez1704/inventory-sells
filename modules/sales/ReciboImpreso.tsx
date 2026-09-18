"use client";

import { useEffect, useState } from "react";
import { Check, Printer, Loader2 } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { MARCA } from "@/lib/marca";
import { imprimirTicketNavegador, type TicketData } from "@/lib/ticket";
import { Button } from "@/components/ui/button";

// The charge's success screen: a little thermal printer feeds the ticket out,
// the way the real one on the counter does. The paper is always white — a
// receipt is paper, not a themed surface — and the content is the same
// TicketData the browser-print path uses, so the two can never disagree.

const DIENTES = 40;
const PROFUNDIDAD = 5;
// Perforated bottom edge: a polygon zigzag across the last PROFUNDIDAD px.
const zigzag = (() => {
  const pts: string[] = ["0% 0%", "100% 0%"];
  for (let i = DIENTES; i >= 0; i--) {
    const x = (i / DIENTES) * 100;
    pts.push(`${x}% calc(100% - ${i % 2 === 0 ? 0 : PROFUNDIDAD}px)`);
  }
  return `polygon(${pts.join(", ")})`;
})();

const PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  otro: "Otro",
  saldo: "Saldo a favor",
  mixto: "Pago mixto",
};

export function ReciboImpreso({
  ticket,
  usoSaldo = 0,
  saldoRestante = 0,
  onClose,
}: {
  ticket: TicketData;
  /** Store credit spent on this sale, and what the customer keeps. */
  usoSaldo?: number;
  saldoRestante?: number;
  onClose: () => void;
}) {
  const [impreso, setImpreso] = useState(false);
  const [sinMotion, setSinMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setSinMotion(mq.matches);
    const t = setTimeout(() => setImpreso(true), mq.matches ? 0 : 1850);
    return () => clearTimeout(t);
  }, []);

  const fecha = new Date(ticket.fecha).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const esFiado = ticket.tipo === "fiado";

  return (
    <div
      className="fixed inset-0 z-70 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-xs sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Venta registrada"
      onClick={onClose}
    >
      <div className="w-full max-w-[340px]" onClick={(e) => e.stopPropagation()}>
        {/* The machine: a slab with a lit status dot and the feed slot. */}
        <div className="relative z-10 rounded-2xl border border-border bg-linear-to-b from-muted to-background p-4 shadow-pop">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {esFiado ? "Nota registrada" : "Cobro completado"}
            </p>
            <span
              aria-live="polite"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-background"
            >
              {impreso ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
              )}
            </span>
          </div>
          {/* Feed slot */}
          <div className="mt-3 h-2 rounded-full bg-slate-950 shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)]" />
        </div>

        {/* Paper feeding out of the slot. The wrapper clips; the paper slides
            from fully hidden to fully out with a hard mechanical ease. */}
        <div className="-mt-3 overflow-hidden px-3 pt-3">
          <article
            className="origin-top bg-white px-5 pb-6 pt-4 font-mono text-[11px] leading-relaxed text-neutral-900 shadow-xl"
            style={{
              clipPath: zigzag,
              animation: sinMotion
                ? undefined
                : "recibo-imprimir 1.75s cubic-bezier(0.77, 0, 0.175, 1) both",
            }}
          >
            <p className="text-center text-sm font-bold tracking-wide">
              {MARCA.tienda.nombre}
            </p>
            <p className="text-center text-neutral-500">{fecha}</p>
            <p className="text-center text-neutral-500">
              {esFiado ? "NOTA DE CRÉDITO" : "TICKET DE VENTA"} · {ticket.folio.slice(0, 8).toUpperCase()}
            </p>
            {ticket.cliente && (
              <p className="mt-1 text-center text-neutral-700">Cliente: {ticket.cliente}</p>
            )}
            <p className="my-2 border-t border-dashed border-neutral-300" />
            {ticket.items.map((it, i) => (
              <p key={i} className="flex justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {it.qty}× {it.nombre}
                </span>
                <span className="shrink-0 tabular-nums">{formatMXN(it.total)}</span>
              </p>
            ))}
            <p className="my-2 border-t border-dashed border-neutral-300" />
            {ticket.descuento && (
              <>
                <p className="flex justify-between text-neutral-700">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatMXN(ticket.descuento.subtotal)}</span>
                </p>
                <p className="flex justify-between text-neutral-700">
                  <span>{ticket.descuento.etiqueta}</span>
                  <span className="tabular-nums">−{formatMXN(ticket.descuento.subtotal - ticket.total)}</span>
                </p>
              </>
            )}
            <p className="flex items-baseline justify-between text-sm font-bold">
              <span>TOTAL</span>
              <span className="tabular-nums">{formatMXN(ticket.total)}</span>
            </p>
            {ticket.metodoPago && (
              <p className="flex justify-between text-neutral-700">
                <span>Pago</span>
                <span>{PAGO[ticket.metodoPago] ?? ticket.metodoPago}</span>
              </p>
            )}
            {esFiado && <p className="mt-1 text-center font-semibold">** PENDIENTE DE PAGO **</p>}
            {usoSaldo > 0 && (
              <>
                <p className="flex justify-between text-neutral-700">
                  <span>Saldo usado</span>
                  <span className="tabular-nums">{formatMXN(usoSaldo)}</span>
                </p>
                {saldoRestante > 0 && (
                  <p className="flex justify-between text-neutral-700">
                    <span>Saldo restante</span>
                    <span className="tabular-nums">{formatMXN(saldoRestante)}</span>
                  </p>
                )}
              </>
            )}
            <p className="mt-3 text-center text-neutral-500">¡Gracias por su compra!</p>
          </article>
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => imprimirTicketNavegador(ticket)}
          >
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
          <Button variant="accent" className="flex-1" onClick={onClose} autoFocus>
            <Check className="h-4 w-4" />
            Listo
          </Button>
        </div>
      </div>

      <style>{`@keyframes recibo-imprimir { from { transform: translateY(-100%); } to { transform: translateY(0); } }`}</style>
    </div>
  );
}
