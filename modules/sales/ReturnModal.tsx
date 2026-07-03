"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Minus } from "lucide-react";
import { formatMXN } from "@/lib/money";
import type { PaymentMethod } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { devolverItems } from "./actions";
import type { SaleWithItems } from "./RecentSales";

const METODOS: [PaymentMethod, string][] = [
  ["efectivo", "Efectivo"],
  ["tarjeta", "Tarjeta"],
  ["transferencia", "Transferencia"],
  ["otro", "Otro"],
];

function Stepper({
  value,
  onDec,
  onInc,
  canInc,
}: {
  value: number;
  onDec: () => void;
  onInc: () => void;
  canInc: boolean;
}) {
  return (
    <div className="flex items-center rounded-lg border border-border">
      <button
        onClick={onDec}
        disabled={value <= 0}
        aria-label="Menos"
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
      >
        <Minus className="h-4 w-4" />
      </button>
      <div className="flex h-8 w-8 items-center justify-center border-x border-border text-sm tabular-nums">
        {value}
      </div>
      <button
        onClick={onInc}
        disabled={!canInc}
        aria-label="Más"
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ReturnModal({
  sale,
  onDone,
  onClose,
}: {
  sale: SaleWithItems;
  onDone: (items: { product_id: string; qty: number }[]) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [metodo, setMetodo] = useState<PaymentMethod>(
    sale.payment_method ?? "efectivo",
  );
  const [motivo, setMotivo] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [pending, start] = useTransition();

  // One line per distinct product in the sale (only lines with a product_id).
  const lineas = useMemo(
    () =>
      sale.sale_items
        .filter((it) => it.product_id)
        .map((it) => ({
          product_id: it.product_id as string,
          nombre: it.products?.name ?? "Producto",
          sold: it.qty,
          unit: it.unit_price_cents,
        })),
    [sale.sale_items],
  );

  const total = lineas.reduce(
    (s, l) => s + l.unit * (qty[l.product_id] ?? 0),
    0,
  );
  const count = lineas.reduce((s, l) => s + (qty[l.product_id] ?? 0), 0);

  function set(id: string, next: number, max: number) {
    setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(next, max)) }));
  }

  function save() {
    const items = lineas
      .map((l) => ({ product_id: l.product_id, qty: qty[l.product_id] ?? 0 }))
      .filter((i) => i.qty > 0);
    if (items.length === 0) return toast.error("Elige qué devolver");
    start(async () => {
      try {
        await devolverItems(sale.id, items, metodo, motivo || null);
        toast.success(`Devolución registrada · ${formatMXN(total)}`);
        onDone(items); // optimistic: drop the returned qty from the list now
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al devolver");
      }
    });
  }

  return (
    <Modal open onClose={onClose} title="Devolver artículos" className="max-w-lg">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Elige cuánto de cada artículo regresa el cliente. El stock vuelve al
          inventario y el reembolso cuenta como salida de efectivo hoy.
        </p>

        <ul className="divide-y divide-border rounded-xl border border-border">
          {lineas.map((l) => {
            const n = qty[l.product_id] ?? 0;
            return (
              <li key={l.product_id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatMXN(l.unit)} c/u · vendidos {l.sold}
                  </p>
                </div>
                <Stepper
                  value={n}
                  onDec={() => set(l.product_id, n - 1, l.sold)}
                  onInc={() => set(l.product_id, n + 1, l.sold)}
                  canInc={n < l.sold}
                />
              </li>
            );
          })}
        </ul>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Reembolso en
            </span>
            <Select
              value={metodo}
              onChange={(e) => setMetodo(e.target.value as PaymentMethod)}
            >
              {METODOS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Motivo (opcional)
            </span>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Falla, cambio de modelo…"
            />
          </label>
        </div>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <div>
            <p className="text-xs text-muted-foreground">
              {count} art. · a reembolsar
            </p>
            <p className="font-mono text-xl font-semibold tabular-nums text-red-600">
              {formatMXN(total)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={save}
              loading={pending}
              disabled={count === 0}
            >
              Registrar devolución
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
