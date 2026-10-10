"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Globe, Lock, MessageCircle, Pencil, Printer, Receipt, Trash2, User, X } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/components/use-is-mobile";
import { useConfirm } from "@/components/ui/use-confirm";
import { imprimirTicketNavegador } from "@/lib/ticket";
import { CustomerPicker, type PickerCustomer } from "@/modules/customers/CustomerPicker";
import { ItemSwapModal } from "@/modules/sales/ItemSwapModal";
import { asignarClienteFiado, cambiarFiado, cancelLoan, setFiadoPublico } from "@/modules/sales/actions";
import { CobrarPanel } from "./CobrarPanel";
import {
  imprimirEstadoCuenta,
  quienDebe,
  resta as restaDe,
  textoEstadoCuenta,
  textoRecordatorio,
  ticketDeAbono,
  ticketDeNota,
  waLink,
  type PieNota,
} from "./estado-cuenta";
import type { Loan } from "./LoansView";

const METODO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  otro: "Otro",
  saldo: "Saldo a favor",
};

const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * One credit note, open: what they took, what they have paid, and every way to
 * close it — collect, remind, reprint, or hand over a statement.
 */
export function PanelNota({
  loan,
  hermanas,
  customers,
  pie,
  esAdmin,
  comprobanteObligatorio,
  onClose,
}: {
  /** null = closed; the last note stays rendered while the panel slides out. */
  loan: Loan | null;
  /** The debtor's other open notes, for the statement. */
  hermanas: Loan[];
  customers: PickerCustomer[];
  pie: PieNota;
  esAdmin: boolean;
  comprobanteObligatorio: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [v, setV] = useState(loan);
  if (loan && loan !== v) setV(loan);
  const [cobrando, setCobrando] = useState(false);
  const [editar, setEditar] = useState(false);
  const [confirmar, dialogoConfirm] = useConfirm();
  const [pending, start] = useTransition();

  const bloqueado = cobrando || editar;

  function asignar(c: PickerCustomer) {
    if (!v) return;
    start(async () => {
      try {
        await asignarClienteFiado(v.id, c.id);
        toast.success(`Nota a nombre de ${c.nombre}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo asignar");
      }
    });
  }

  async function cancelar() {
    if (!v) return;
    const ok = await confirmar({
      title: "¿Cancelar la nota?",
      description: "Las piezas vuelven al inventario y la deuda se borra.",
      confirmLabel: "Sí, cancelar",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      try {
        await cancelLoan(v.id);
        toast.success("Nota cancelada, stock restaurado");
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo cancelar");
      }
    });
  }

  const falta = v ? restaDe(v) : 0;
  const pct = v && v.total_cents > 0 ? Math.min(100, Math.round((v.pagado_cents / v.total_cents) * 100)) : 0;
  const telefono = v?.cliente && !v.cliente.is_system ? v.cliente.telefono : null;
  const sinCliente = !v?.cliente || v.cliente.is_system;
  const todas = v ? [v, ...hermanas.filter((h) => h.id !== v.id)] : [];

  function conTelefono(accion: (tel: string) => void) {
    if (!telefono) {
      toast.error("Esta nota no tiene teléfono. Asígnale un cliente registrado.");
      return;
    }
    accion(telefono);
  }

  return (
    <Drawer
      open={!!loan}
      onOpenChange={(o) => !o && !bloqueado && onClose()}
      swipeDirection={isMobile ? "down" : "right"}
      showSwipeHandle={isMobile}
      modal={!bloqueado}
    >
      <DrawerContent className="data-[swipe-direction=down]:top-14 data-[swipe-direction=down]:max-h-none data-[swipe-direction=right]:w-[min(560px,100vw)]">
        {dialogoConfirm}
        {v && (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 pt-1 pb-3 sm:px-6 sm:pt-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <DrawerTitle className="text-lg font-semibold sm:text-xl">{quienDebe(v)}</DrawerTitle>
                  {sinCliente && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                      Sin cliente
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                  Nota {v.id.replace(/-/g, "").slice(0, 8).toUpperCase()} · {hora(v.created_at)}
                  {v.vendedor && ` · ${v.vendedor}`}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div data-base-ui-swipe-ignore className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
              <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Le queda por pagar</span>
                  <span className="text-3xl font-bold tabular-nums">{formatMXN(falta)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
                  <span>Abonado {formatMXN(v.pagado_cents)}</span>
                  <span>Total {formatMXN(v.total_cents)}</span>
                </div>
              </div>

              {sinCliente && (
                <div className="space-y-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                  <p className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                    <User className="h-4 w-4" />
                    Esta nota solo dice «{v.note?.trim() || "sin seña"}»
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    Con un cliente registrado puedes cobrarle aunque tú no estés, y mandarle recordatorios.
                  </p>
                  <CustomerPicker
                    customers={customers}
                    value={null}
                    onChange={asignar}
                    placeholder="Asignar cliente"
                    excludeSystem
                    openUp={false}
                  />
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-semibold">Lo que se llevó</p>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {v.sale_items.map((it, i) => (
                    <li key={i} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                      <span className="w-7 shrink-0 text-muted-foreground tabular-nums">{it.qty}×</span>
                      <span className="min-w-0 flex-1 truncate">{it.products?.name ?? "Producto eliminado"}</span>
                      {it.unit_price_cents != null && (
                        <span className="shrink-0 tabular-nums">{formatMXN(it.unit_price_cents * it.qty)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {v.abonos.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">
                    Abonos <span className="font-normal text-muted-foreground">· {v.abonos.length}</span>
                  </p>
                  <ul className="space-y-2">
                    {v.abonos.map((a, i) => {
                      const previos = v.abonos.slice(0, i + 1).reduce((s, x) => s + x.monto_cents, 0);
                      return (
                        <li key={a.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-muted-foreground tabular-nums">{hora(a.created_at)}</p>
                            <p className="truncate text-sm">
                              {METODO_LABEL[a.metodo ?? ""] ?? a.metodo ?? "Pago"}
                              {a.quien && ` · ${a.quien}`}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                            {formatMXN(a.monto_cents)}
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              imprimirTicketNavegador(
                                ticketDeAbono(v, a, Math.max(0, v.total_cents - previos), pie),
                              )
                            }
                          >
                            <Receipt className="h-3.5 w-3.5" />
                            Ticket
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => imprimirTicketNavegador(ticketDeNota(v, pie))}>
                  <Printer className="h-4 w-4" />
                  Reimprimir ticket
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => conTelefono((tel) => window.open(waLink(tel, textoRecordatorio(v)), "_blank"))}
                >
                  <MessageCircle className="h-4 w-4 text-emerald-600" />
                  Recordar por WhatsApp
                </Button>
                <Button variant="secondary" onClick={() => imprimirEstadoCuenta(quienDebe(v), todas, pie)}>
                  <FileText className="h-4 w-4" />
                  Imprimir estado de cuenta
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    conTelefono((tel) => window.open(waLink(tel, textoEstadoCuenta(quienDebe(v), todas)), "_blank"))
                  }
                >
                  <MessageCircle className="h-4 w-4" />
                  Estado de cuenta por WhatsApp
                </Button>
              </div>

              {hermanas.length > 0 && (
                <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                  {quienDebe(v)} tiene {hermanas.length + 1} notas abiertas. El estado de cuenta las incluye todas:{" "}
                  {formatMXN(todas.reduce((s, l) => s + restaDe(l), 0))} en total.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                {/* Correcting a note is the counter's job — the seller who
                    made the mistake is the one standing there. Only the
                    public/private switch is the admin's. */}
                {esAdmin && (
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await setFiadoPublico(v.id, !v.fiado_publico);
                        if (!r.ok) {
                          toast.error(r.error);
                          return;
                        }
                        toast.success(
                          v.fiado_publico
                            ? "Solo quien la hizo puede cobrarla"
                            : "Cualquier vendedor puede cobrarla",
                        );
                        router.refresh();
                      })
                    }
                  >
                    {v.fiado_publico ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                    {v.fiado_publico ? "La cobra cualquiera" : "Solo su vendedor"}
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setEditar(true)} disabled={pending}>
                  <Pencil className="h-4 w-4" />
                  Editar productos
                </Button>
                <Button variant="ghost" onClick={cancelar} disabled={pending}>
                  <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                  Cancelar nota
                </Button>
              </div>
            </div>

            <div className="flex gap-2.5 border-t border-border px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
              <Button variant="secondary" className="h-12 flex-1" onClick={() => setCobrando(true)}>
                Abonar
              </Button>
              <Button className="h-13 flex-2 text-base sm:h-12" onClick={() => setCobrando(true)}>
                Liquidar {formatMXN(falta)}
              </Button>
            </div>

            <CobrarPanel
              open={cobrando}
              loan={v}
              pie={pie}
              comprobanteObligatorio={comprobanteObligatorio}
              verComision={esAdmin}
              onClose={() => setCobrando(false)}
              onListo={() => {
                setCobrando(false);
                onClose();
              }}
            />

            <ItemSwapModal
              open={editar}
              onClose={() => setEditar(false)}
              title="Editar productos de la nota"
              description="Agrega, quita o cambia piezas. El stock se ajusta solo: lo que quites regresa al inventario, lo nuevo se descuenta."
              currentItems={v.sale_items}
              onSubmit={(items) => cambiarFiado(v.id, items)}
              successMsg={(t) => `Nota actualizada · ${formatMXN(t)}`}
            />
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
