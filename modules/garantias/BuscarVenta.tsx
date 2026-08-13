"use client";

import { useEffect, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buscarVentasGarantia, type VentaGarantia } from "./cliente-actions";

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Step one of a warranty: which sale.
 *
 * The customer arrives holding the part, not the folio, so this searches the
 * three things they might actually have — their name, the part, or the folio
 * off the ticket.
 */
export function BuscarVenta({ onElegir }: { onElegir: (v: VentaGarantia) => void }) {
  const [q, setQ] = useState("");
  const [ventas, setVentas] = useState<VentaGarantia[]>([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) {
      setVentas([]);
      return;
    }
    let cancelado = false;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await buscarVentasGarantia(q);
        if (!cancelado) setVentas(r);
      } catch {
        if (!cancelado) setVentas([]);
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cliente, número de parte o folio…"
          className="pl-9"
        />
        {buscando && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {q.trim().length < 2 ? (
        <p className="px-1 py-6 text-center text-sm text-muted-foreground">
          Busca la venta donde se compró la pieza.
        </p>
      ) : ventas.length === 0 && !buscando ? (
        <p className="px-1 py-6 text-center text-sm text-muted-foreground">
          Ninguna venta coincide con “{q}”.
        </p>
      ) : (
        <ul className="max-h-[45vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
          {ventas.map((v) => (
            <li key={v.id}>
              <button
                type="button"
                disabled={v.es_mostrador}
                onClick={() => onElegir(v)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  v.es_mostrador
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer hover:bg-muted/60",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {v.customer_name ?? "Sin cliente"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fecha(v.created_at)} · {v.piezas}{" "}
                    {v.piezas === 1 ? "pieza" : "piezas"} ·{" "}
                    <span className="font-mono uppercase">{v.id.slice(0, 8)}</span>
                  </p>
                </div>
                {/* Shown, not hidden: the operator has to see the sale exists
                    and why it cannot carry a warranty, rather than search for
                    something that silently is not there. */}
                {v.es_mostrador ? (
                  <Badge tone="warning">Sin cliente</Badge>
                ) : (
                  <span className="shrink-0 font-mono text-sm tabular-nums">
                    {formatMXN(v.total_cents)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {ventas.some((v) => v.es_mostrador) && (
        <p className="text-xs text-muted-foreground">
          Las ventas a Mostrador no pueden llevar garantía: una garantía se
          resuelve con una persona. Asigna el cliente a la venta primero.
        </p>
      )}
    </div>
  );
}
