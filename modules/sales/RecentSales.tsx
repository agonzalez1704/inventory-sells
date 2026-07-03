"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Receipt,
  Pencil,
  ChevronRight,
  HandCoins,
  Repeat,
  Undo2,
} from "lucide-react";
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
import { ItemSwapModal, type SwapProduct } from "@/modules/sales/ItemSwapModal";
import { ReturnModal } from "@/modules/sales/ReturnModal";
import { editarVenta, convertirAFiado, cambiarVentaItems } from "./actions";

// A sale row with its line items embedded (for the expandable detail).
export type SaleLine = {
  product_id: string | null;
  qty: number;
  unit_price_cents: number;
  products: { name: string; sku: string } | null;
};
export type SaleWithItems = Sale & {
  sale_items: SaleLine[];
  vendedor?: string | null;
};

const PAYMENT: [PaymentMethod, string][] = [
  ["efectivo", "Efectivo"],
  ["tarjeta", "Tarjeta"],
  ["transferencia", "Transferencia"],
  ["otro", "Otro"],
];
const LABEL = Object.fromEntries(PAYMENT) as Record<string, string>;

function EditModal({
  sale,
  products,
  onClose,
}: {
  sale: SaleWithItems;
  products: SwapProduct[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentMethod>(
    sale.payment_method ?? "efectivo",
  );
  const [customer, setCustomer] = useState(sale.customer_name ?? "");
  const [swapOpen, setSwapOpen] = useState(false);
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

  function aFiado() {
    if (
      !confirm(
        "¿Convertir esta venta en fiado? Pasará a pendientes de pago (el stock no cambia).",
      )
    )
      return;
    start(async () => {
      try {
        await convertirAFiado(sale.id, customer);
        toast.success("Convertida a fiado");
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al convertir");
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

        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs font-medium">¿Se equivocó de producto?</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Cambia, agrega o quita productos de esta venta. El stock y el total
            se ajustan solos.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={() => setSwapOpen(true)}
            disabled={pending}
          >
            <Repeat className="h-4 w-4" />
            Cambiar productos
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs font-medium">¿Era un fiado?</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pásala a pendientes de pago. El campo “Cliente” se usa como la nota
            de a quién. El stock no cambia.
          </p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2"
            onClick={aFiado}
            disabled={pending}
          >
            <HandCoins className="h-4 w-4" />
            Convertir a fiado
          </Button>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={save} loading={pending}>
            Guardar
          </Button>
        </div>
      </div>

      <ItemSwapModal
        open={swapOpen}
        onClose={() => setSwapOpen(false)}
        title="Cambiar productos de la venta"
        description="Cambia el modelo, agrega o quita productos. El stock se ajusta solo (lo que quites regresa, lo nuevo se descuenta) y el total se recalcula."
        currentItems={sale.sale_items}
        products={products}
        onSubmit={(items) => cambiarVentaItems(sale.id, items)}
        successMsg={(t) => `Venta actualizada · ${formatMXN(t)}`}
      />
    </Modal>
  );
}

export function RecentSales({
  sales,
  isAdmin,
  products,
}: {
  sales: SaleWithItems[];
  isAdmin: boolean;
  products: SwapProduct[];
}) {
  const [edit, setEdit] = useState<SaleWithItems | null>(null);
  const [returnSale, setReturnSale] = useState<SaleWithItems | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const cols = isAdmin ? 7 : 6;

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
                <th className="hidden px-2 py-2.5 font-medium sm:table-cell">
                  Vendedor
                </th>
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
                      <td className="hidden px-2 py-2.5 text-muted-foreground sm:table-cell">
                        {s.vendedor ?? "—"}
                      </td>
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
                          <p className="mb-1.5 text-xs text-muted-foreground sm:hidden">
                            Vendedor: {s.vendedor ?? "—"}
                          </p>
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
                            <div className="mt-2.5 flex flex-wrap items-center justify-end gap-2">
                              {isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setReturnSale(s);
                                  }}
                                >
                                  <Undo2 className="h-4 w-4" />
                                  Devolver
                                </Button>
                              )}
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

      {edit && (
        <EditModal sale={edit} products={products} onClose={() => setEdit(null)} />
      )}
      {returnSale && (
        <ReturnModal sale={returnSale} onClose={() => setReturnSale(null)} />
      )}
    </div>
  );
}
