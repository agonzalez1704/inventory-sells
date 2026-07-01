"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HandCoins, User, Pencil } from "lucide-react";
import { formatMXN } from "@/lib/money";
import type { PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ItemSwapModal, type SwapProduct } from "@/modules/sales/ItemSwapModal";
import { settleLoan, cancelLoan, cambiarFiado } from "@/modules/sales/actions";

export type { SwapProduct };

type LoanItem = {
  product_id: string | null;
  qty: number;
  products: { name: string; sku: string } | null;
};
export type Loan = {
  id: string;
  total_cents: number;
  note: string | null;
  created_at: string;
  sale_items: LoanItem[];
};

const PAYMENT_METHODS: [PaymentMethod, string][] = [
  ["efectivo", "Efectivo"],
  ["tarjeta", "Tarjeta"],
  ["transferencia", "Transferencia"],
  ["otro", "Otro"],
];

function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}

export function LoansView({
  loans,
  products,
}: {
  loans: Loan[];
  products: SwapProduct[];
}) {
  const total = loans.reduce((s, l) => s + l.total_cents, 0);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Fiados</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Productos prestados, pago pendiente.
          </p>
        </div>
        {loans.length > 0 && (
          <div className="text-right">
            <p className="text-xs font-medium text-muted-foreground">Por cobrar</p>
            <p className="font-mono text-xl font-semibold tabular-nums">
              {formatMXN(total)}
            </p>
          </div>
        )}
      </div>

      {loans.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="Sin fiados pendientes"
          description="Cuando prestes un producto desde Ventas, aparecerá aquí para cobrarlo después."
        />
      ) : (
        <div className="space-y-2.5">
          {loans.map((l) => (
            <LoanRow key={l.id} loan={l} products={products} />
          ))}
        </div>
      )}
    </section>
  );
}

function LoanRow({
  loan,
  products,
}: {
  loan: Loan;
  products: SwapProduct[];
}) {
  const router = useRouter();
  const [payment, setPayment] = useState<PaymentMethod>("efectivo");
  const [swapOpen, setSwapOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const items = loan.sale_items
    .map((it) => `${it.products?.name ?? "?"}${it.qty > 1 ? ` ×${it.qty}` : ""}`)
    .join(" · ");

  function collect() {
    startTransition(async () => {
      try {
        await settleLoan(loan.id, payment);
        toast.success(`Cobrado · ${formatMXN(loan.total_cents)}`);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al cobrar");
      }
    });
  }

  function cancel() {
    if (!confirm("¿Cancelar fiado y devolver el producto al stock?")) return;
    startTransition(async () => {
      try {
        await cancelLoan(loan.id);
        toast.success("Fiado cancelado, stock restaurado");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al cancelar");
      }
    });
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium">
            <User className="h-4 w-4 text-muted-foreground" />
            {loan.note || "Sin nota"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{items}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{ago(loan.created_at)}</p>
        </div>
        <p className="font-mono text-lg font-semibold tabular-nums">
          {formatMXN(loan.total_cents)}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        <Button
          variant="ghost"
          onClick={() => setSwapOpen(true)}
          disabled={pending}
        >
          <Pencil className="h-4 w-4" />
          Editar productos
        </Button>
        <Button variant="ghost" onClick={cancel} disabled={pending}>
          Cancelar
        </Button>
        <Select
          value={payment}
          onChange={(e) => setPayment(e.target.value as PaymentMethod)}
          className="h-9 w-auto"
        >
          {PAYMENT_METHODS.map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </Select>
        <Button variant="accent" onClick={collect} loading={pending}>
          <HandCoins className="h-4 w-4" />
          Cobrar
        </Button>
      </div>

      <ItemSwapModal
        open={swapOpen}
        onClose={() => setSwapOpen(false)}
        title="Editar productos del fiado"
        description="Agrega, quita o cambia productos de este fiado. El stock se ajusta solo: lo que quites regresa al inventario, lo nuevo se descuenta."
        currentItems={loan.sale_items}
        products={products}
        onSubmit={(items) => cambiarFiado(loan.id, items)}
        successMsg={(t) => `Fiado actualizado · ${formatMXN(t)}`}
      />
    </Card>
  );
}
