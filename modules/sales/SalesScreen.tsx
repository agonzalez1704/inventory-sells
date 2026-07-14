"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Plus, Minus, Package } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { searchProducts } from "@/lib/search";
import type { PaymentMethod, Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { imprimirTicketNavegador, type TicketData } from "@/lib/ticket";
import { CustomerPicker, type PickerCustomer } from "@/modules/customers/CustomerPicker";
import { CompatPanel } from "@/modules/compat/CompatPanel";
import { registerSale, registerLoan } from "./actions";

export type SalesProduct = Pick<
  Product,
  "id" | "sku" | "name" | "size" | "price_cents" | "quantity"
> & { inventory_name?: string | null };

const PAYMENT_METHODS: [PaymentMethod, string][] = [
  ["efectivo", "Efectivo"],
  ["tarjeta", "Tarjeta"],
  ["transferencia", "Transferencia"],
  ["otro", "Otro"],
];

function Thumb() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <Package className="h-5 w-5" />
    </span>
  );
}

function ProductButton({
  p,
  inCart,
  onAdd,
}: {
  p: SalesProduct;
  inCart: number;
  onAdd: () => void;
}) {
  const soldOut = p.quantity === 0;
  const maxed = inCart >= p.quantity;
  return (
    <button
      onClick={onAdd}
      disabled={soldOut || maxed}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border border-border bg-background p-2.5 text-left transition-colors",
        soldOut || maxed
          ? "opacity-60"
          : "cursor-pointer hover:border-ring/30 hover:bg-muted/40 active:bg-muted",
      )}
    >
      <Thumb />
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
          <span className="text-xs font-medium text-accent">{inCart} en venta</span>
        ) : (
          <span className="text-xs text-muted-foreground">{p.quantity} disp.</span>
        )}
      </div>
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          soldOut || maxed
            ? "bg-muted text-muted-foreground"
            : "bg-primary text-primary-foreground",
        )}
      >
        <Plus className="h-4 w-4" />
      </span>
    </button>
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
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted"
      >
        <Minus className="h-4 w-4" />
      </button>
      <div className="flex h-9 w-10 items-center justify-center border-x border-border text-sm tabular-nums">
        {value}
      </div>
      <button
        onClick={onInc}
        disabled={!canInc}
        aria-label="Agregar uno"
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export function SalesScreen({
  products,
  customers,
}: {
  products: SalesProduct[];
  customers: PickerCustomer[];
}) {
  const router = useRouter();
  const mostrador = useMemo(
    () => customers.find((c) => c.is_system) ?? customers[0],
    [customers],
  );
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<"venta" | "prestamo">("venta");
  const [payment, setPayment] = useState<PaymentMethod>("efectivo");
  const [customer, setCustomer] = useState<PickerCustomer>(mostrador);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const byId = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products],
  );

  // Brand-alias aware search ("moto g42", "redmi note 7"); in-stock first.
  const results = useMemo(
    () =>
      searchProducts(products, query, {
        limit: 12,
        tieBreak: (a, b) => Number(b.quantity > 0) - Number(a.quantity > 0),
      }),
    [query, products],
  );

  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ product: byId[id], qty }))
    .filter((l) => l.product);
  const total = lines.reduce((s, l) => s + l.product.price_cents * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  function add(p: SalesProduct) {
    setCart((c) => {
      const cur = c[p.id] ?? 0;
      if (cur >= p.quantity) return c;
      return { ...c, [p.id]: cur + 1 };
    });
  }
  function setQty(id: string, qty: number) {
    setCart((c) => {
      const max = byId[id]?.quantity ?? 0;
      const next = Math.max(0, Math.min(qty, max));
      if (next === 0) {
        const { [id]: _omit, ...rest } = c;
        return rest;
      }
      return { ...c, [id]: next };
    });
  }

  const canSubmit =
    lines.length > 0 && !(mode === "prestamo" && note.trim() === "");

  function submit() {
    if (!canSubmit) return;
    const items = lines.map((l) => ({ product_id: l.product.id, qty: l.qty }));
    // Snapshot the ticket data now — the cart is cleared before the user taps
    // "Imprimir" in the toast, so the closure must capture, not read state.
    const esFiado = mode === "prestamo";
    const ticketItems = lines.map((l) => ({
      nombre: l.product.name,
      qty: l.qty,
      precioUnit: l.product.price_cents,
      total: l.product.price_cents * l.qty,
    }));
    const ticketTotal = total;
    const ticketCliente = esFiado
      ? note.trim() || null
      : customer.is_system
        ? null
        : customer.nombre;
    const ticketPago = esFiado ? null : payment;

    startTransition(async () => {
      try {
        const { saleId } = esFiado
          ? await registerLoan(items, note)
          : await registerSale(items, payment, customer.id);
        const ticket: TicketData = {
          folio: saleId,
          fecha: new Date().toISOString(),
          items: ticketItems,
          total: ticketTotal,
          metodoPago: ticketPago,
          cliente: ticketCliente,
          tipo: esFiado ? "fiado" : "venta",
        };
        toast.success(
          `${esFiado ? "Fiado registrado" : "Venta registrada"} · ${formatMXN(ticketTotal)}`,
          {
            action: {
              label: "Imprimir",
              onClick: () => imprimirTicketNavegador(ticket),
            },
          },
        );
        setCart({});
        setCustomer(mostrador);
        setNote("");
        setQuery("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al registrar");
      }
    });
  }

  const cta = mode === "prestamo" ? "Registrar fiado" : "Cobrar";

  return (
    <>
      <div className="gap-5 pb-24 lg:grid lg:grid-cols-5 lg:pb-0">
        {/* Picker */}
        <div className="lg:col-span-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto por SKU o nombre…"
              className="h-12 pl-9 text-base"
            />
          </div>

          <div className="mt-3 space-y-2">
            {results.length === 0 ? (
              <>
                <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                  Sin resultados.
                </p>
                {query.trim() && (
                  <CompatPanel
                    query={query}
                    products={products}
                    renderItem={(p) => (
                      <ProductButton
                        key={p.id}
                        p={p}
                        inCart={cart[p.id] ?? 0}
                        onAdd={() => add(p)}
                      />
                    )}
                  />
                )}
              </>
            ) : (
              results.map((p) => (
                <ProductButton
                  key={p.id}
                  p={p}
                  inCart={cart[p.id] ?? 0}
                  onAdd={() => add(p)}
                />
              ))
            )}
          </div>
        </div>

        {/* Cart */}
        <div className="mt-5 lg:col-span-2 lg:mt-0">
          <Card className="overflow-hidden lg:sticky lg:top-20">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
                {(["venta", "prestamo"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={cn(
                      "cursor-pointer rounded-md px-3 py-1 font-medium transition-colors",
                      mode === m
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m === "venta" ? "Venta" : "Fiado"}
                  </button>
                ))}
              </div>
              {count > 0 && (
                <Badge
                  tone={mode === "prestamo" ? "warning" : "accent"}
                  className="ml-auto"
                >
                  {count}
                </Badge>
              )}
            </div>

            {lines.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={Package}
                  title="Carrito vacío"
                  description="Busca y toca un producto para agregarlo."
                  className="border-0 py-10"
                />
              </div>
            ) : (
              <>
                <ul className="max-h-[19rem] divide-y divide-border overflow-auto">
                  {lines.map((l) => (
                    <li
                      key={l.product.id}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <Thumb />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {l.product.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatMXN(l.product.price_cents)} c/u
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <Stepper
                          value={l.qty}
                          onDec={() => setQty(l.product.id, l.qty - 1)}
                          onInc={() => setQty(l.product.id, l.qty + 1)}
                          canInc={l.qty < l.product.quantity}
                        />
                        <span className="font-mono text-xs font-semibold tabular-nums">
                          {formatMXN(l.product.price_cents * l.qty)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>

                <div className="space-y-3 border-t border-border p-4">
                  {mode === "venta" ? (
                    <div className="space-y-2">
                      <Select
                        value={payment}
                        onChange={(e) =>
                          setPayment(e.target.value as PaymentMethod)
                        }
                      >
                        {PAYMENT_METHODS.map(([v, label]) => (
                          <option key={v} value={v}>
                            {label}
                          </option>
                        ))}
                      </Select>
                      <CustomerPicker
                        customers={customers}
                        value={customer}
                        onChange={setCustomer}
                      />
                    </div>
                  ) : (
                    <Input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="¿A quién? Ej: Ernesto · Local 87"
                    />
                  )}

                  <div className="flex items-baseline justify-between">
                    <span className="text-sm text-muted-foreground">Total</span>
                    <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
                      {formatMXN(total)}
                    </span>
                  </div>

                  {/* Desktop action — mobile uses the fixed bottom bar */}
                  <Button
                    variant="accent"
                    size="lg"
                    className="hidden w-full lg:flex"
                    onClick={submit}
                    loading={pending}
                    disabled={!canSubmit}
                  >
                    {cta} {formatMXN(total)}
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>

      {/* Fixed mobile checkout bar */}
      {lines.length > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="leading-tight">
              <p className="text-xs text-muted-foreground">
                {count} art. · {mode === "prestamo" ? "Fiado" : "Total"}
              </p>
              <p className="font-mono text-lg font-semibold tabular-nums">
                {formatMXN(total)}
              </p>
            </div>
            <Button
              variant="accent"
              size="lg"
              className="ml-auto h-12 flex-1 text-base"
              onClick={submit}
              loading={pending}
              disabled={!canSubmit}
            >
              {cta}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
