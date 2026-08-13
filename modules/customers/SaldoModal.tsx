"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Receipt } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { movimientosDeSaldo, type MovimientoSaldo } from "@/modules/garantias/cliente-actions";

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Where a balance came from and where it went.
 *
 * The number on its own is not confirmation of anything — a balance nobody can
 * explain is a balance nobody trusts, and the first question after seeing one
 * is always "from what?". Every row names its source document, which is exactly
 * what the ledger was built to guarantee.
 */
export function SaldoModal({
  customerId,
  nombre,
  saldo,
  onClose,
}: {
  customerId: string;
  nombre: string;
  saldo: number;
  onClose: () => void;
}) {
  const [movs, setMovs] = useState<MovimientoSaldo[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    movimientosDeSaldo(customerId)
      .then((m) => !cancelado && setMovs(m))
      .catch(() => !cancelado && setMovs([]));
    return () => {
      cancelado = true;
    };
  }, [customerId]);

  return (
    <Modal open onClose={onClose} title={`Saldo a favor · ${nombre}`} className="max-w-lg">
      <div className="space-y-4">
        <div className="rounded-xl border border-border p-4 text-center">
          <p className="text-xs text-muted-foreground">Disponible para su próxima compra</p>
          <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatMXN(saldo)}
          </p>
        </div>

        {movs === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cargando movimientos…</p>
        ) : movs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sin movimientos.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {movs.map((m) => {
              const abona = m.monto_cents > 0;
              return (
                <li key={m.id} className="flex items-start gap-3 px-3 py-2.5">
                  <span
                    className={cn(
                      "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      abona
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {abona ? <ShieldCheck className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {abona ? (
                        <>
                          Regresó {m.qty} {m.qty === 1 ? "pieza" : "piezas"}
                          {/* Says how many of how many. A partial return is the
                              norm — three sold, one back — and without the
                              denominator the amount looks arbitrary. */}
                          {m.vendidas && m.vendidas > (m.qty ?? 0) ? ` de ${m.vendidas}` : ""}
                          {m.pieza ? `: ${m.pieza}` : ""}
                        </>
                      ) : (
                        "Pagó con su saldo"
                      )}
                    </p>
                    {m.motivo && (
                      <p className="text-xs text-foreground/80">{m.motivo}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {fecha(m.created_at)}
                      {m.sku ? ` · ${m.sku.toUpperCase()}` : ""}
                      {m.sale_id && (
                        <>
                          {" · "}
                          <Link
                            href={`/ventas?venta=${m.sale_id}`}
                            className="underline-offset-2 hover:underline"
                          >
                            {abona ? "ver la venta original" : "ver la venta"}
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-sm font-semibold tabular-nums",
                      abona ? "text-emerald-700 dark:text-emerald-400" : "text-foreground",
                    )}
                  >
                    {abona ? "+" : "−"}
                    {formatMXN(Math.abs(m.monto_cents))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          Se abona con una garantía resuelta como saldo, y se gasta eligiendo
          &ldquo;Saldo&rdquo; al cobrar en el punto de venta.
        </p>
      </div>
    </Modal>
  );
}
