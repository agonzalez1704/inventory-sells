"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HandCoins, User, Pencil } from "lucide-react";
import { formatMXN } from "@/lib/money";
import type { PaymentMethod } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { ItemSwapModal, type SwapProduct } from "@/modules/sales/ItemSwapModal";
import {
  settleLoan,
  cancelLoan,
  cambiarFiado,
  abonarFiado,
} from "@/modules/sales/actions";

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
  pagado_cents: number;
  vendedor: string | null; // who created the fiado
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
  const total = loans.reduce(
    (s, l) => s + Math.max(0, l.total_cents - l.pagado_cents),
    0,
  );

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
  const [abonar, setAbonar] = useState(false);
  const [pending, startTransition] = useTransition();

  const resta = Math.max(0, loan.total_cents - loan.pagado_cents);
  const pct = Math.min(100, Math.round((loan.pagado_cents / loan.total_cents) * 100));
  const conAbonos = loan.pagado_cents > 0;

  const items = loan.sale_items
    .map((it) => `${it.products?.name ?? "?"}${it.qty > 1 ? ` ×${it.qty}` : ""}`)
    .join(" · ");

  function collect() {
    startTransition(async () => {
      try {
        await settleLoan(loan.id, payment);
        toast.success(`Cobrado · ${formatMXN(resta)}`);
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
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ago(loan.created_at)}
            {loan.vendedor && <> · Creó {loan.vendedor}</>}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-semibold tabular-nums">
            {formatMXN(loan.total_cents)}
          </p>
          {conAbonos && (
            <p className="text-xs text-muted-foreground">
              Pagado {formatMXN(loan.pagado_cents)} · resta{" "}
              <span className="font-medium text-foreground">{formatMXN(resta)}</span>
            </p>
          )}
        </div>
      </div>

      {conAbonos && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand to-brand-strong"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

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
        <Button variant="secondary" onClick={() => setAbonar(true)} disabled={pending}>
          <HandCoins className="h-4 w-4" />
          Abonar
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
          Cobrar {conAbonos ? formatMXN(resta) : ""}
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

      {abonar && (
        <AbonarFiadoModal loan={loan} resta={resta} onClose={() => setAbonar(false)} />
      )}
    </Card>
  );
}

function AbonarFiadoModal({
  loan,
  resta,
  onClose,
}: {
  loan: Loan;
  resta: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<PaymentMethod>("efectivo");
  const [pending, start] = useTransition();

  function save() {
    const pesos = Number(monto.replace(",", "."));
    if (!Number.isFinite(pesos) || pesos <= 0) return toast.error("Monto inválido");
    if (Math.round(pesos * 100) > resta) return toast.error("El abono excede lo que falta");
    start(async () => {
      try {
        await abonarFiado(loan.id, pesos, metodo);
        toast.success(`Abono registrado · ${formatMXN(Math.round(pesos * 100))}`);
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al abonar");
      }
    });
  }

  return (
    <Modal open onClose={onClose} title="Abono al fiado" className="max-w-sm">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {loan.note || "Fiado"} · falta{" "}
          <span className="font-medium text-foreground">{formatMXN(resta)}</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Monto (MXN)</span>
            <Input
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Método</span>
            <Select value={metodo} onChange={(e) => setMetodo(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={save} loading={pending}>
            Guardar abono
          </Button>
        </div>
      </div>
    </Modal>
  );
}
