"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  HandCoins,
  User,
  Search,
  Plus,
  Minus,
  Package,
  Repeat,
} from "lucide-react";
import { formatMXN } from "@/lib/money";
import type { PaymentMethod, Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { settleLoan, cancelLoan, cambiarFiado } from "@/modules/sales/actions";

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

export type SwapProduct = Pick<
  Product,
  "id" | "sku" | "name" | "size" | "price_cents" | "quantity"
> & { inventory_name?: string | null };

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
          <Repeat className="h-4 w-4" />
          Cambiar producto
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

      <SwapModal
        open={swapOpen}
        onClose={() => setSwapOpen(false)}
        loan={loan}
        products={products}
      />
    </Card>
  );
}

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
        aria-label="Quitar uno"
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted"
      >
        <Minus className="h-4 w-4" />
      </button>
      <div className="flex h-8 w-8 items-center justify-center border-x border-border text-sm tabular-nums">
        {value}
      </div>
      <button
        onClick={onInc}
        disabled={!canInc}
        aria-label="Agregar uno"
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function SwapModal({
  open,
  onClose,
  loan,
  products,
}: {
  open: boolean;
  onClose: () => void;
  loan: Loan;
  products: SwapProduct[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const byId = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products],
  );

  // What this loan already holds, by product — its stock is restored first, so
  // it's available again for the new selection: max = current stock + this qty.
  const initialQ = useMemo(() => {
    const m: Record<string, number> = {};
    for (const it of loan.sale_items) {
      if (it.product_id) m[it.product_id] = (m[it.product_id] ?? 0) + it.qty;
    }
    return m;
  }, [loan.sale_items]);

  const [cart, setCart] = useState<Record<string, number>>(initialQ);

  const maxFor = (id: string) =>
    (byId[id]?.quantity ?? 0) + (initialQ[id] ?? 0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? products.filter(
          (p) =>
            p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
        )
      : products;
    return base.slice(0, 10);
  }, [query, products]);

  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ product: byId[id], qty }))
    .filter((l) => l.product);
  const total = lines.reduce((s, l) => s + l.product.price_cents * l.qty, 0);

  function add(p: SwapProduct) {
    setCart((c) => {
      const cur = c[p.id] ?? 0;
      if (cur >= maxFor(p.id)) return c;
      return { ...c, [p.id]: cur + 1 };
    });
  }
  function setQty(id: string, qty: number) {
    setCart((c) => {
      const next = Math.max(0, Math.min(qty, maxFor(id)));
      if (next === 0) {
        const { [id]: _omit, ...rest } = c;
        return rest;
      }
      return { ...c, [id]: next };
    });
  }

  // Anything changed vs. what the loan currently holds?
  const dirty =
    lines.length !== Object.keys(initialQ).length ||
    lines.some((l) => (initialQ[l.product.id] ?? 0) !== l.qty);

  function save() {
    if (lines.length === 0) return;
    const items = lines.map((l) => ({ product_id: l.product.id, qty: l.qty }));
    startTransition(async () => {
      try {
        await cambiarFiado(loan.id, items);
        toast.success(`Fiado actualizado · ${formatMXN(total)}`);
        onClose();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al cambiar");
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Cambiar producto del fiado" className="max-w-xl">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Quita el producto equivocado y agrega el correcto. El stock se ajusta
          solo: lo que quites regresa al inventario, lo nuevo se descuenta.
        </p>

        {/* Current selection */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            En este fiado
          </p>
          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
              Sin productos. Agrega al menos uno.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {lines.map((l) => (
                <li
                  key={l.product.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {l.product.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatMXN(l.product.price_cents)} c/u
                    </p>
                  </div>
                  <Stepper
                    value={l.qty}
                    onDec={() => setQty(l.product.id, l.qty - 1)}
                    onInc={() => setQty(l.product.id, l.qty + 1)}
                    canInc={l.qty < maxFor(l.product.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Picker */}
        <div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto para agregar…"
              className="h-11 pl-9"
            />
          </div>
          <div className="mt-2 max-h-60 space-y-1.5 overflow-auto">
            {results.length === 0 ? (
              <p className="px-1 py-5 text-center text-sm text-muted-foreground">
                Sin resultados.
              </p>
            ) : (
              results.map((p) => {
                const inCart = cart[p.id] ?? 0;
                const max = maxFor(p.id);
                const soldOut = max === 0;
                const maxed = inCart >= max;
                return (
                  <button
                    key={p.id}
                    onClick={() => add(p)}
                    disabled={soldOut || maxed}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border border-border bg-background p-2.5 text-left transition-colors",
                      soldOut || maxed
                        ? "opacity-60"
                        : "cursor-pointer hover:border-ring/30 hover:bg-muted/40 active:bg-muted",
                    )}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <Package className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        <span className="font-mono">{p.sku}</span>
                        {p.size && <span>· {p.size}</span>}
                        {p.inventory_name && (
                          <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 font-medium text-accent">
                            {p.inventory_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm font-semibold tabular-nums">
                        {formatMXN(p.price_cents)}
                      </p>
                      {soldOut ? (
                        <Badge tone="danger">Agotado</Badge>
                      ) : inCart > 0 ? (
                        <span className="text-xs font-medium text-accent">
                          {inCart} en fiado
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {max} disp.
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border pt-3">
          <div>
            <p className="text-xs text-muted-foreground">Nuevo total</p>
            <p className="font-mono text-xl font-semibold tabular-nums">
              {formatMXN(total)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button
              variant="accent"
              onClick={save}
              loading={pending}
              disabled={lines.length === 0 || !dirty}
            >
              Guardar cambios
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
