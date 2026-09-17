"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HandCoins, Repeat, Trash2 } from "lucide-react";
import { formatMXN } from "@/lib/money";
import type { PaymentMethod, Sale } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/use-confirm";
import { ItemSwapModal } from "@/modules/sales/ItemSwapModal";
import { CustomerPicker, type PickerCustomer } from "@/modules/customers/CustomerPicker";
import { editarVenta, convertirAFiado, cambiarVentaItems, anularVenta } from "./actions";

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
  canal?: string | null;
  /** When a credit note was paid off. The date the sale really happened. */
  settled_at?: string | null;
  /** Business account the transfer landed in, per the tagged proof. */
  cuenta?: { id: string; banco: string; alias: string } | null;
};

const PAYMENT: [PaymentMethod, string][] = [
  ["efectivo", "Efectivo"],
  ["tarjeta", "Tarjeta"],
  ["transferencia", "Transferencia"],
  ["otro", "Otro"],
];
// "mixto" is display-only: it labels a split sale but is never an option
// you pick, so it stays out of PAYMENT.
const LABEL = { ...Object.fromEntries(PAYMENT), mixto: "Mixto" } as Record<string, string>;

export function EditModal({
  sale,
  customers,
  onClose,
}: {
  sale: SaleWithItems;
  customers: PickerCustomer[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [confirmar, dialogoConfirm] = useConfirm();
  // A split sale has no single method to refund with, so the operator picks
  // one; anything else keeps the sale's own method as the default. 'saldo' is
  // in the same boat — store credit is not something a correction can re-book
  // the sale to, so the editor starts from cash.
  const [payment, setPayment] = useState<PaymentMethod>(
    sale.payment_method && sale.payment_method !== "mixto" && sale.payment_method !== "saldo"
      ? sale.payment_method
      : "efectivo",
  );
  const [customer, setCustomer] = useState(sale.customer_name ?? "");
  // Seeded by name: the sales list does not carry customer_id, and matching on
  // the name is enough to preselect. Whatever the operator picks is what gets
  // written, by id.
  const [cliente, setCliente] = useState<PickerCustomer | null>(
    () => customers.find((c) => c.nombre === sale.customer_name) ?? null,
  );
  const [swapOpen, setSwapOpen] = useState(false);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      try {
        await editarVenta(sale.id, payment, customer, cliente?.id ?? null);
        toast.success("Venta corregida");
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al editar");
      }
    });
  }

  async function aFiado() {
    if (
      !(await confirmar({
        title: "¿Convertir esta venta en nota de crédito?",
        description: "Pasará a pendientes de pago. El stock no cambia.",
        confirmLabel: "Convertir",
      }))
    )
      return;
    start(async () => {
      try {
        await convertirAFiado(sale.id, customer);
        toast.success("Convertida a nota de crédito");
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al convertir");
      }
    });
  }

  async function anular() {
    if (
      !(await confirmar({
        title: "¿Anular esta venta?",
        description:
          "Regresa el stock y quita su dinero del corte. Es para ventas duplicadas o registradas por error.",
        confirmLabel: "Anular",
        tone: "danger",
      }))
    )
      return;
    start(async () => {
      try {
        await anularVenta(sale.id);
        toast.success("Venta anulada");
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al anular");
      }
    });
  }

  return (
    <Modal open onClose={onClose} title="Corregir venta" className="max-w-md">
      {dialogoConfirm}
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
            Cliente
          </span>
          {customers.length > 0 ? (
            <>
              <CustomerPicker
                customers={customers}
                value={cliente}
                onChange={setCliente}
                placeholder="Elegir cliente"
                openUp={false}
              />
              {/* Why it is worth doing rather than typing a name: everything
                  that belongs to the person and not the label hangs off this —
                  a warranty, and the credit a warranty leaves. A sale on
                  Mostrador with someone's name typed in reads as assigned and
                  is not. */}
              <span className="mt-1.5 block text-xs text-muted-foreground">
                Mostrador no puede llevar garantía ni saldo a favor. Asigna al
                cliente registrado para que pueda.
              </span>
            </>
          ) : (
            <Input value={customer} onChange={(e) => setCustomer(e.target.value)} />
          )}
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
          <p className="text-xs font-medium">¿Era a crédito?</p>
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
            Convertir a nota de crédito
          </Button>
        </div>

        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/40 p-3">
          <p className="text-xs font-medium text-red-700 dark:text-red-300">¿Venta duplicada o por error?</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Anúlala: regresa el stock y quita su dinero del corte. No se puede
            deshacer.
          </p>
          <Button
            variant="danger"
            size="sm"
            className="mt-2"
            onClick={anular}
            disabled={pending}
          >
            <Trash2 className="h-4 w-4" />
            Anular venta
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
        onSubmit={(items) => cambiarVentaItems(sale.id, items)}
        successMsg={(t) => `Venta actualizada · ${formatMXN(t)}`}
      />
    </Modal>
  );
}
