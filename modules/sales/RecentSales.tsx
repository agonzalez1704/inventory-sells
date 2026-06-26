"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Receipt, Pencil, ChevronRight } from "lucide-react";
import { formatMXN } from "@/lib/money";
import type { PaymentMethod, Sale } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PrintTicketButtons } from "@/components/ticket/PrintTicketButtons";
import { editarVenta } from "./actions";

// A sale row with its line items embedded (for the expandable detail).
export type SaleLine = {
  qty: number;
  unit_price_cents: number;
  products: { name: string; sku: string } | null;
};
export type SaleWithItems = Sale & { sale_items: SaleLine[] };

const PAYMENT: [PaymentMethod, string][] = [
  ["efectivo", "Efectivo"],
  ["tarjeta", "Tarjeta"],
  ["transferencia", "Transferencia"],
  ["otro", "Otro"],
];
const LABEL = Object.fromEntries(PAYMENT) as Record<string, string>;

function EditModal({
  sale,
  onClose,
}: {
  sale: Sale;
  onClose: () => void;
}) {
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentMethod>(
    sale.payment_method ?? "efectivo",
  );
  const [customer, setCustomer] = useState(sale.customer_name ?? "");
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      try {
        await editarVenta(sale.id, payment, customer);
        toast.success("Venta corregida");
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al editar");
      }
    });
  }

  return (
    <Modal open onClose={onClose} title="Corregir venta" className="max-w-md">
      <div className="space-y-3">
        <p className="font-mono text-lg font-semibold tabular-nums">
          {formatMXN(sale.total_cents)}
        </p>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Método de pago
          </span>
          <Select
            value={payment}
            onChange={(e) => setPayment(e.target.value as PaymentMethod)}
          >
            {PAYMENT.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">
            Cliente (opcional)
          </span>
          <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={save} loading={pending}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function RecentSales({
  sales,
  isAdmin,
}: {
  sales: SaleWithItems[];
  isAdmin: boolean;
}) {
  const [edit, setEdit] = useState<Sale | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const cols = isAdmin ? 6 : 5;

  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground">
        Ventas recientes
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Toca una venta para ver sus productos.
      </p>
      {sales.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Aún no hay ventas"
          description="Las ventas que registres aparecerán aquí."
          className="mt-3"
        />
      ) : (
        <Card className="mt-3 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-8 px-2 py-2.5" />
                <th className="px-2 py-2.5 font-medium">Fecha</th>
                <th className="px-2 py-2.5 font-medium">Cliente</th>
                <th className="px-2 py-2.5 font-medium">Pago</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
                {isAdmin && <th className="px-2 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => {
                const expanded = open.has(s.id);
                const items = s.sale_items ?? [];
                return (
                  <Fragment key={s.id}>
                    <tr
                      onClick={() => toggle(s.id)}
                      className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/40"
                    >
                      <td className="px-2 py-2.5 text-muted-foreground">
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 transition-transform",
                            expanded && "rotate-90",
                          )}
                        />
                      </td>
                      <td className="px-2 py-2.5 text-muted-foreground">
                        {new Date(s.created_at).toLocaleString("es-MX", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-2 py-2.5">{s.customer_name ?? "—"}</td>
                      <td className="px-2 py-2.5">
                        <Badge tone="neutral">
                          {s.payment_method
                            ? (LABEL[s.payment_method] ?? s.payment_method)
                            : "—"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {formatMXN(s.total_cents)}
                      </td>
                      {isAdmin && (
                        <td className="px-2 py-2.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEdit(s);
                            }}
                            aria-label="Corregir venta"
                            className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                    {expanded && (
                      <tr className="border-b border-border/60 bg-muted/30 last:border-0">
                        <td />
                        <td colSpan={cols - 1} className="px-2 pb-3 pt-0.5">
                          {items.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Sin productos registrados.
                            </p>
                          ) : (
                            <>
                            <ul className="divide-y divide-border/60">
                              {items.map((it, i) => (
                                <li
                                  key={i}
                                  className="flex items-center justify-between gap-3 py-1.5"
                                >
                                  <span className="min-w-0 flex-1 truncate">
                                    <span className="font-medium tabular-nums">
                                      {it.qty}×
                                    </span>{" "}
                                    {it.products?.name ?? "Producto eliminado"}
                                    {it.products?.sku && (
                                      <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                                        {it.products.sku}
                                      </span>
                                    )}
                                  </span>
                                  <span className="shrink-0 text-right">
                                    <span className="font-mono tabular-nums">
                                      {formatMXN(it.unit_price_cents * it.qty)}
                                    </span>
                                    {it.qty > 1 && (
                                      <span className="ml-1.5 text-xs text-muted-foreground">
                                        ({formatMXN(it.unit_price_cents)} c/u)
                                      </span>
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ul>
                            <div className="mt-2.5 flex justify-end">
                              <PrintTicketButtons
                                data={() => ({
                                  folio: s.id,
                                  fecha: s.created_at,
                                  items: items.map((it) => ({
                                    nombre: it.products?.name ?? "Producto eliminado",
                                    qty: it.qty,
                                    precioUnit: it.unit_price_cents,
                                    total: it.unit_price_cents * it.qty,
                                  })),
                                  total: s.total_cents,
                                  metodoPago: s.payment_method,
                                  cliente: s.customer_name,
                                  tipo: "venta",
                                })}
                              />
                            </div>
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {edit && <EditModal sale={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
