"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Plus, Minus, ShoppingCart } from "lucide-react";
import { formatMXN } from "@/lib/money";
import type { PaymentMethod, Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { registerSale, registerLoan } from "./actions";

export type SalesProduct = Pick<
  Product,
  "id" | "sku" | "name" | "size" | "price_cents" | "quantity"
>;

const PAYMENT_METHODS: [PaymentMethod, string][] = [
  ["efectivo", "Efectivo"],
  ["tarjeta", "Tarjeta"],
  ["transferencia", "Transferencia"],
  ["otro", "Otro"],
];

export function SalesScreen({ products }: { products: SalesProduct[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<"venta" | "prestamo">("venta");
  const [payment, setPayment] = useState<PaymentMethod>("efectivo");
  const [customer, setCustomer] = useState("");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const byId = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products],
  );

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

  function submit() {
    const items = lines.map((l) => ({ product_id: l.product.id, qty: l.qty }));
    startTransition(async () => {
      try {
        if (mode === "prestamo") {
          await registerLoan(items, note);
          toast.success(`Fiado registrado · ${formatMXN(total)}`);
        } else {
          await registerSale(items, payment, customer);
          toast.success(`Venta registrada · ${formatMXN(total)}`);
        }
        setCart({});
        setCustomer("");
        setNote("");
        setQuery("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al registrar");
      }
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      {/* Picker */}
      <div className="lg:col-span-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto por SKU o nombre…"
            className="h-11 pl-9"
            autoFocus
          />
        </div>

        <div className="mt-3 space-y-1.5">
          {results.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              Sin resultados.
            </p>
          ) : (
            results.map((p) => {
              const inCart = cart[p.id] ?? 0;
              const soldOut = p.quantity === 0;
              const maxed = inCart >= p.quantity;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 transition-colors",
                    !soldOut && "hover:border-ring/30 hover:bg-muted/40",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{p.sku}</span>
                      {p.size && <span>· {p.size}</span>}
                      <span className="font-mono">{formatMXN(p.price_cents)}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {soldOut ? (
                      <Badge tone="danger">Agotado</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {p.quantity} disp.
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => add(p)}
                      disabled={soldOut || maxed}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {inCart > 0 ? inCart : "Agregar"}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="lg:col-span-2">
        <Card className="sticky top-20 overflow-hidden">
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
              <Badge tone={mode === "prestamo" ? "warning" : "accent"} className="ml-auto">
                {count}
              </Badge>
            )}
          </div>

          {lines.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={ShoppingCart}
                title="Carrito vacío"
                description="Busca y agrega productos para registrar una venta."
                className="border-0 py-10"
              />
            </div>
          ) : (
            <>
              <ul className="max-h-72 divide-y divide-border overflow-auto">
                {lines.map((l) => (
                  <li key={l.product.id} className="flex items-center gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{l.product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatMXN(l.product.price_cents)} c/u
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setQty(l.product.id, l.qty - 1)}
                        aria-label="Quitar uno"
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-7 text-center text-sm tabular-nums">
                        {l.qty}
                      </span>
                      <button
                        onClick={() => setQty(l.product.id, l.qty + 1)}
                        disabled={l.qty >= l.product.quantity}
                        aria-label="Agregar uno"
                        className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="w-20 text-right font-mono text-sm tabular-nums">
                      {formatMXN(l.product.price_cents * l.qty)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="space-y-3 border-t border-border p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
                    {formatMXN(total)}
                  </span>
                </div>
                {mode === "venta" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={payment}
                      onChange={(e) => setPayment(e.target.value as PaymentMethod)}
                    >
                      {PAYMENT_METHODS.map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </Select>
                    <Input
                      value={customer}
                      onChange={(e) => setCustomer(e.target.value)}
                      placeholder="Cliente (opcional)"
                    />
                  </div>
                ) : (
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="¿A quién? Ej: Ernesto · Local 87"
                  />
                )}
                <Button
                  variant="accent"
                  size="lg"
                  className="w-full"
                  onClick={submit}
                  loading={pending}
                  disabled={mode === "prestamo" && note.trim() === ""}
                >
                  {mode === "prestamo"
                    ? `Registrar fiado · ${formatMXN(total)}`
                    : `Cobrar ${formatMXN(total)}`}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
