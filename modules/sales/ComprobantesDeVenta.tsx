"use client";

import { useEffect, useState } from "react";
import { Receipt, ExternalLink } from "lucide-react";
import { comprobantesDeVenta, type Comprobante } from "./comprobantes";

/**
 * A sale's transfer proofs, fetched when the row expands. Renders nothing when
 * there are none — most transfers will simply not have one captured.
 */
export function ComprobantesDeVenta({ saleId }: { saleId: string }) {
  const [rows, setRows] = useState<Comprobante[]>([]);

  useEffect(() => {
    let on = true;
    comprobantesDeVenta(saleId)
      .then((r) => on && setRows(r))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [saleId]);

  if (rows.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Receipt className="h-3.5 w-3.5" />
        Comprobante{rows.length > 1 ? "s" : ""} de pago
      </p>
      <ul className="mt-1 space-y-0.5">
        {rows.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 text-xs">
            {c.referencia && <span className="font-mono">{c.referencia}</span>}
            {c.imagen_url && (
              <a
                href={c.imagen_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 font-medium text-brand-foreground hover:underline"
              >
                Ver captura <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <span className="text-muted-foreground">
              {new Date(c.created_at).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
