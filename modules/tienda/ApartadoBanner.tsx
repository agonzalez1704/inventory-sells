"use client";

import { useEffect, useState } from "react";
import { Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

const horaCorta = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });

function restante(min: number): string {
  if (min <= 0) return "Venció";
  if (min < 60) return `Quedan ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `Quedan ${h} h${m ? ` ${m} min` : ""}`;
}

/**
 * The clock on a hold: until when, how much is left, and what happens after.
 *
 * Ticks in the browser (the page is server-rendered and could sit open for
 * hours), and says plainly that the pieces go back on sale — that is the whole
 * reason the customer should come now.
 */
export function ApartadoBanner({
  hasta,
  horas,
  sucursal,
  vencida = false,
}: {
  hasta: string;
  /** The window the shop granted, for the progress bar. */
  horas: number;
  sucursal: string | null;
  vencida?: boolean;
}) {
  const fin = new Date(hasta).getTime();
  const [ahora, setAhora] = useState(fin);
  // Start from the real clock only after mount: rendering Date.now() on the
  // server and again on the client is a hydration mismatch.
  useEffect(() => {
    setAhora(Date.now());
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const min = Math.max(0, Math.round((fin - ahora) / 60000));
  const total = Math.max(1, Math.round(horas * 60));
  const pct = Math.max(0, Math.min(100, (min / total) * 100));
  const seAcabo = vencida || min <= 0;

  return (
    <div
      className={cn(
        "mt-5 rounded-xl border p-4",
        seAcabo ? "border-border bg-muted/40" : "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          {seAcabo ? "Apartado vencido" : "Apartado hasta"}
        </span>
        {!seAcabo && (
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">{restante(min)}</span>
        )}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{horaCorta(hasta)}</p>
      {!seAcabo && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-100 dark:bg-amber-900/50">
          <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="mt-2 text-pretty text-[13px] leading-relaxed text-muted-foreground">
        {seAcabo
          ? "Las piezas volvieron al catálogo. Si todavía las quieres, vuelve a apartarlas o escríbenos por WhatsApp."
          : `Te las guardamos hasta esa hora${
              sucursal ? ` en ${sucursal}` : ""
            }; después se liberan para otros clientes. Pagas al recoger.`}
      </p>
      {sucursal && !seAcabo && (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] font-medium text-foreground">
          <MapPin className="h-4 w-4 text-tienda-600" />
          {sucursal}
        </p>
      )}
    </div>
  );
}
