"use client";

import { useState } from "react";
import { MapPin, Navigation, Share2, Check, Clock } from "lucide-react";
import { TIENDA } from "@/lib/tienda-info";

// The pickup "pass" the customer forwards to whoever collects — usually an Uber
// driver who navigates to the store and gives the folio. So it carries the two
// things that person needs: how to get there (a maps link) and how to identify
// the order (the folio). Sharing sends the address + folio + this page's URL.
export function PasePickup({ folio, pagada }: { folio: string; pagada: boolean }) {
  const [copiado, setCopiado] = useState(false);

  async function compartir() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const texto = [
      `Recoge mi pedido ${folio} en Lead Displays`,
      TIENDA.direccion,
      `Horario: ${TIENDA.horario}`,
      `Cómo llegar: ${TIENDA.mapsUrl}`,
    ].join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: `Pedido ${folio}`, text: texto, url });
        return;
      }
      await navigator.clipboard.writeText(`${texto}\n${url}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  }

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-blue-200 bg-blue-50/50">
      <div className="flex items-center justify-between gap-3 border-b border-blue-100 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">
          Pase de recolección
        </span>
        <span
          className={
            pagada
              ? "rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-semibold text-green-700"
              : "rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
          }
        >
          {pagada ? "Pagado · listo para recoger" : "Pendiente de pago"}
        </span>
      </div>

      <div className="px-4 py-4">
        <p className="text-xs text-slate-500">Muestra este folio al recoger</p>
        <p className="select-all font-mono text-2xl font-bold tracking-wider text-slate-900">
          {folio}
        </p>

        <div className="mt-4 flex items-start gap-2 text-sm text-slate-700">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <span>{TIENDA.direccion}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          {TIENDA.horario}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={TIENDA.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
          >
            <Navigation className="h-4 w-4" />
            Cómo llegar
          </a>
          <button
            onClick={compartir}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700"
          >
            {copiado ? <Check className="h-4 w-4 text-green-600" /> : <Share2 className="h-4 w-4" />}
            {copiado ? "Copiado" : "Compartir con quien recoge"}
          </button>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Puedes venir tú o mandar un mensajero/Uber. Reenvíale este pase: trae
          cómo llegar y el folio que damos al entregar.
        </p>
      </div>
    </div>
  );
}
