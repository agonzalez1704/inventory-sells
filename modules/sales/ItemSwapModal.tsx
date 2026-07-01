"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Plus, Minus, Package } from "lucide-react";
import { formatMXN } from "@/lib/money";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type SwapProduct = Pick<
  Product,
  "id" | "sku" | "name" | "size" | "price_cents" | "quantity"
> & { inventory_name?: string | null };

export type SwapItem = { product_id: string | null; qty: number };

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

// Add / remove / swap the items on a sale or loan. The old items are restored to
// stock first (server-side), so the max for any product is its current stock
// plus what this record already holds. onSubmit runs the matching RPC.
export function ItemSwapModal({
  open,
  onClose,
  title,
  description,
  submitLabel = "Guardar cambios",
  currentItems,
  products,
  onSubmit,
  successMsg,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  submitLabel?: string;
  currentItems: SwapItem[];
  products: SwapProduct[];
  onSubmit: (items: { product_id: string; qty: number }[]) => Promise<void>;
  successMsg: (totalCents: number) => string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const byId = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products],
  );

  const initialQ = useMemo(() => {
    const m: Record<string, number> = {};
    for (const it of currentItems) {
      if (it.product_id) m[it.product_id] = (m[it.product_id] ?? 0) + it.qty;
    }
    return m;
  }, [currentItems]);

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

  const dirty =
    lines.length !== Object.keys(initialQ).length ||
    lines.some((l) => (initialQ[l.product.id] ?? 0) !== l.qty);

  function save() {
    if (lines.length === 0) return;
    const items = lines.map((l) => ({ product_id: l.product.id, qty: l.qty }));
    startTransition(async () => {
      try {
        await onSubmit(items);
        toast.success(successMsg(total));
        onClose();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al cambiar");
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-xl">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{description}</p>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Productos
          </p>
          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
              Sin productos. Agrega al menos uno.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {lines.map((l) => (
                <li key={l.product.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{l.product.name}</p>
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
                          {inCart} en la lista
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
              {submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
