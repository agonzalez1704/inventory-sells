"use client";

import { useEffect, useState } from "react";
import { ArrowRightToLine, Camera, ChevronLeft, ChevronRight, History, Pencil, ShieldCheck, Undo2 } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { foto as urlFoto } from "@/lib/foto";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { CuentaChip } from "@/components/ui/cuenta";
import { PrintTicketButtons } from "@/components/ticket/PrintTicketButtons";
import { ComprobantesDeVenta } from "./ComprobantesDeVenta";
import { DevolucionPanel } from "./DevolucionPanel";
import { cambiosDeVenta, type CambioVenta } from "./cambios-actions";
import { METODO_LABEL, type VentaLista } from "./VentasView";

const TZ = "America/Mexico_City";
const cuando = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: TZ, weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const hora = (iso: string) => new Intl.DateTimeFormat("es-MX", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const mismoDia = (a: string, b: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(a)) === new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(b));

/**
 * One sale beside the list (same pattern as the product panel): what was sold,
 * how it was paid, its proof, what changed afterwards, and the actions.
 */
export function PanelVenta({
  venta,
  anterior,
  siguiente,
  onNavegar,
  onClose,
  isAdmin,
  bloqueado,
  onCorregir,
  onGarantia,
}: {
  /** null = closed; the last sale stays rendered while the panel slides out. */
  venta: VentaLista | null;
  anterior: string | null;
  siguiente: string | null;
  onNavegar: (id: string) => void;
  onClose: () => void;
  isAdmin: boolean;
  /** A modal opened from the panel is on top. */
  bloqueado: boolean;
  onCorregir: (v: VentaLista) => void;
  onGarantia: (v: VentaLista) => void;
}) {
  const [v, setV] = useState(venta);
  if (venta && venta !== v) setV(venta);
  const [devolviendo, setDevolviendo] = useState(false);
  const [cambios, setCambios] = useState<CambioVenta[]>([]);

  useEffect(() => {
    setDevolviendo(false);
    setCambios([]);
    if (!v) return;
    let vivo = true;
    cambiosDeVenta(v.id)
      .then((c) => vivo && setCambios(c))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [v?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!venta) return;
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (devolviendo || bloqueado || (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName))) return;
      if (e.key === "ArrowLeft" && anterior) onNavegar(anterior);
      else if (e.key === "ArrowRight" && siguiente) onNavegar(siguiente);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [venta, anterior, siguiente, onNavegar, devolviendo, bloqueado]);

  const transfer = v && (v.payment_method === "transferencia" || v.payment_method === "mixto");

  return (
    <Drawer open={venta != null} onOpenChange={(o) => !o && !bloqueado && onClose()} swipeDirection="right" modal={!bloqueado}>
      <DrawerContent className="data-[swipe-direction=right]:w-[min(620px,100vw)]">
        {v && (
          <>
            <DrawerTitle className="sr-only">Venta de {formatMXN(v.total_cents)}</DrawerTitle>
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 sm:px-5">
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar panel">
                <ArrowRightToLine className="h-5 w-5" />
              </Button>
              <div className="flex-1" />
              <div className="hidden sm:block">
                <Ticket v={v} />
              </div>
              <Button variant="secondary" size="sm" className="h-9" onClick={() => onGarantia(v)}>
                <ShieldCheck className="h-4 w-4" />
                Garantía
              </Button>
              {isAdmin && (
                <>
                  <Button variant="secondary" size="sm" className="h-9" onClick={() => setDevolviendo(true)}>
                    <Undo2 className="h-4 w-4" />
                    Devolver
                  </Button>
                  <Button variant="secondary" size="icon" onClick={() => onCorregir(v)} aria-label="Corregir venta" title="Corregir pago, cliente o productos; anular">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-sm text-muted-foreground first-letter:uppercase">Venta · {cuando(v.settled_at ?? v.created_at)}</p>
                  <p className="text-4xl font-semibold tabular-nums tracking-tight">{formatMXN(v.total_cents)}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <MetodoPill metodo={v.payment_method} />
                    {v.cuenta && <CuentaChip cuenta={v.cuenta} />}
                    {v.settled_at && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Fiado cobrado</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button variant="secondary" size="icon" aria-label="Venta anterior" disabled={!anterior} onClick={() => anterior && onNavegar(anterior)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="secondary" size="icon" aria-label="Venta siguiente" disabled={!siguiente} onClick={() => siguiente && onNavegar(siguiente)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[15px] font-semibold">Productos</p>
                {v.sale_items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin productos registrados.</p>
                ) : (
                  <ul>
                    {v.sale_items.map((it, i) => (
                      <li key={i} className="flex items-center gap-3 border-t border-border/70 py-2.5">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                          {it.products?.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={urlFoto(it.products.image_url, 128)} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Camera className="h-5 w-5 text-muted-foreground/50" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{it.products?.name ?? "Producto eliminado"}</p>
                          {it.products?.sku && <p className="truncate font-mono text-xs text-muted-foreground">{it.products.sku}</p>}
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {it.qty} × {formatMXN(it.unit_price_cents)}
                        </span>
                        <span className="w-24 text-right text-sm font-semibold tabular-nums">{formatMXN(it.qty * it.unit_price_cents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <dl>
                <p className="mb-1.5 text-[15px] font-semibold">Detalle</p>
                <Dato k="Cliente">{v.customer_name || "—"}</Dato>
                <Dato k="Vendedor">{v.vendedor ?? "—"}</Dato>
                <Dato k="Canal">{v.canal === "online" ? "En línea" : "Mostrador"}</Dato>
                {v.settled_at && (
                  <Dato k="Fiado">
                    <span className="text-muted-foreground">
                      {mismoDia(v.created_at, v.settled_at)
                        ? `Se vendió a las ${hora(v.created_at)} y se cobró a las ${hora(v.settled_at)}`
                        : `Se vendió el ${cuando(v.created_at)} y se cobró el ${cuando(v.settled_at)}`}
                    </span>
                  </Dato>
                )}
              </dl>

              {transfer && (
                <div>
                  <p className="text-[15px] font-semibold">Comprobante de pago</p>
                  <ComprobantesDeVenta saleId={v.id} />
                </div>
              )}

              {cambios.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 dark:border-amber-900 dark:bg-amber-950/20">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-800 dark:text-amber-300">
                    <History className="h-4 w-4" /> Cambios después de la venta
                  </p>
                  <ul className="mt-2 space-y-2">
                    {cambios.map((c, i) => (
                      <li key={i} className="text-sm">
                        <span className="text-xs text-muted-foreground first-letter:uppercase">
                          {cuando(c.fecha)} · {c.quien}
                        </span>
                        {c.cambios.map((t) => (
                          <p key={t}>{t}</p>
                        ))}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="border-t border-border px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 sm:hidden">
              <Ticket v={v} />
            </div>

            {isAdmin && <DevolucionPanel open={devolviendo} venta={v} onClose={() => setDevolviendo(false)} />}
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}

function Ticket({ v }: { v: VentaLista }) {
  return (
    <PrintTicketButtons
      data={() => ({
        folio: v.id,
        fecha: v.created_at,
        items: v.sale_items.map((it) => ({
          nombre: it.products?.name ?? "Producto eliminado",
          qty: it.qty,
          precioUnit: it.unit_price_cents,
          total: it.unit_price_cents * it.qty,
        })),
        total: v.total_cents,
        metodoPago: v.payment_method,
        cliente: v.customer_name,
        tipo: "venta",
      })}
    />
  );
}

export function MetodoPill({ metodo, className }: { metodo: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        metodo === "transferencia" ? "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300" : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {metodo ? (METODO_LABEL[metodo] ?? metodo) : "—"}
    </span>
  );
}

function Dato({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-3 border-t border-border/70 py-1.5 text-sm">
      <dt className="w-24 shrink-0 text-muted-foreground">{k}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
