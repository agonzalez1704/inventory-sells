"use client";

import { useState } from "react";
import { MapPin, Navigation, Share2, Check, Clock } from "lucide-react";
import { mapsUrl } from "@/lib/tienda-info";
import { useTiendaInfo } from "./TiendaInfoProvider";
import { MARCA } from "@/lib/marca";

// The pickup "pass" the customer forwards to whoever collects — usually an Uber
// driver who navigates to the store and gives the folio. So it carries the two
// things that person needs: how to get there (a maps link) and how to identify
// the order (the folio). Sharing sends the address + folio + this page's URL.
export function PasePickup({ folio, pagada }: { folio: string; pagada: boolean }) {
  const [copiado, setCopiado] = useState(false);

  const tienda = useTiendaInfo();
  const comoLlegar = mapsUrl(tienda);

  async function compartir() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    // Lines the shop has not filled in are dropped rather than sent as
    // "Horario: undefined" to a customer's phone.
    const texto = [
      `Recoge mi pedido ${folio} en ${MARCA.tienda.nombre}`,
      tienda.direccion,
      tienda.horario && `Horario: ${tienda.horario}`,
      comoLlegar && `Cómo llegar: ${comoLlegar}`,
    ]
      .filter(Boolean)
      .join("\n");
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
    <div className="mt-5 overflow-hidden rounded-2xl border border-tienda-200 dark:border-tienda-900 bg-tienda-50/50 dark:bg-tienda-950/40">
      <div className="flex items-center justify-between gap-3 border-b border-tienda-100 dark:border-tienda-900 px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-tienda-700 dark:text-tienda-300">
          Pase de recolección
        </span>
        <span
          className={
            pagada
              ? "rounded-full bg-green-100 dark:bg-green-900/40 px-2.5 py-1 text-[11px] font-semibold text-green-700 dark:text-green-300"
              : "rounded-full bg-amber-100 dark:bg-amber-900/40 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300"
          }
        >
          {pagada ? "Pagado · listo para recoger" : "Pendiente de pago"}
        </span>
      </div>

      <div className="px-4 py-4">
        <p className="text-xs text-muted-foreground">Muestra este folio al recoger</p>
        <p className="select-all font-mono text-2xl font-bold tracking-wider text-foreground">
          {folio}
        </p>

        {tienda.direccion && (
          <div className="mt-4 flex items-start gap-2 text-sm text-foreground">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-tienda-600 dark:text-tienda-400" />
            <span>{tienda.direccion}</span>
          </div>
        )}
        {tienda.horario && (
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {tienda.horario}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={comoLlegar ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-tienda-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-tienda-700"
          >
            <Navigation className="h-4 w-4" />
            Cómo llegar
          </a>
          <button
            onClick={compartir}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground transition-colors hover:border-tienda-300 dark:border-tienda-800 hover:text-tienda-700 dark:text-tienda-300"
          >
            {copiado ? <Check className="h-4 w-4 text-green-600 dark:text-green-400" /> : <Share2 className="h-4 w-4" />}
            {copiado ? "Copiado" : "Compartir con quien recoge"}
          </button>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Puedes venir tú o mandar un mensajero/Uber. Reenvíale este pase: trae
          cómo llegar y el folio que damos al entregar.
        </p>
      </div>
    </div>
  );
}
