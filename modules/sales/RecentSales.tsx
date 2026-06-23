"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Receipt, Pencil } from "lucide-react";
import { formatMXN } from "@/lib/money";
import type { PaymentMethod, Sale } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { editarVenta } from "./actions";

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
  sales: Sale[];
  isAdmin: boolean;
}) {
  const [edit, setEdit] = useState<Sale | null>(null);

  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground">
        Ventas recientes
      </h2>
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
                <th className="px-4 py-2.5 font-medium">Fecha</th>
                <th className="px-4 py-2.5 font-medium">Cliente</th>
                <th className="px-4 py-2.5 font-medium">Pago</th>
                <th className="px-4 py-2.5 text-right font-medium">Total</th>
                {isAdmin && <th className="px-2 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr
                  key={s.id}
                  onClick={isAdmin ? () => setEdit(s) : undefined}
                  className={cn(
                    "border-b border-border/60 transition-colors last:border-0",
                    isAdmin && "cursor-pointer hover:bg-muted/40",
                  )}
                >
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {new Date(s.created_at).toLocaleString("es-MX", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-2.5">{s.customer_name ?? "—"}</td>
                  <td className="px-4 py-2.5">
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
                    <td className="px-2 py-2.5 text-muted-foreground">
                      <Pencil className="h-3.5 w-3.5" />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {edit && <EditModal sale={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
