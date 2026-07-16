"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Minus,
  Package,
  Trash2,
  ShoppingCart,
  Check,
} from "lucide-react";
import { formatMXN } from "@/lib/money";
import { searchProducts } from "@/lib/search";
import type { PaymentMethod, Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { imprimirTicketNavegador, type TicketData } from "@/lib/ticket";
import { CustomerPicker, type PickerCustomer } from "@/modules/customers/CustomerPicker";
import { CompatPanel } from "@/modules/compat/CompatPanel";
import { PaymentSheet } from "./PaymentSheet";
import { registerSale, registerLoan } from "./actions";

export type SalesProduct = Pick<
  Product,
  "id" | "sku" | "name" | "brand" | "size" | "category" | "price_cents" | "quantity"
> & { inventory_name?: string | null; image_url?: string | null };

const GRID_LIMIT = 30;

function Thumb({
  src,
  alt,
  className,
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={cn("h-full w-full object-contain", className)}
      />
    );
  }
  return (
    <span className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
      <Package className="h-6 w-6" />
    </span>
  );
}

// Grid card (photo-first) — the whole card adds to the order.
function ProductCard({
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
        "group relative flex flex-col rounded-2xl border border-border bg-background p-2.5 text-left transition-all",
        soldOut
          ? "opacity-60"
          : "cursor-pointer hover:-translate-y-0.5 hover:border-ring/40 hover:shadow-md hover:shadow-black/5 active:translate-y-0",
      )}
    >
      {inCart > 0 && (
        <span className="absolute right-4 top-4 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-white shadow-sm">
          {inCart}
        </span>
      )}
      <div className="relative mb-2 aspect-square overflow-hidden rounded-xl bg-white">
        <Thumb src={p.image_url} alt={p.name} className="transition-transform duration-300 group-hover:scale-105" />
        {soldOut && (
          <span className="absolute inset-x-0 bottom-0 bg-red-600/90 py-0.5 text-center text-[10px] font-semibold text-white">
            Agotado
          </span>
        )}
        {!soldOut && !maxed && (
          <span className="absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-110">
            <Plus className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className="line-clamp-2 min-h-[2.25rem] text-sm font-medium leading-tight">
        {p.name}
      </p>
      {(p.brand || p.category) && (
        <p className="mt-0.5 truncate text-xs capitalize text-muted-foreground">
          {[p.brand, p.category].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="mt-1 flex items-center justify-between gap-1">
        <span className="font-mono text-sm font-semibold tabular-nums text-accent">
          {formatMXN(p.price_cents)}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {soldOut ? "—" : `${p.quantity} disp.`}
        </span>
      </div>
    </button>
  );
}

// Compact row — used by the AI "compatible models" fallback list.
function ProductRow({
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
      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
        <Thumb src={p.image_url} alt={p.name} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{p.name}</p>
        <p className="truncate text-xs capitalize text-muted-foreground">
          {[p.brand, p.category].filter(Boolean).join(" · ") || p.sku}
        </p>
      </div>
      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
        {formatMXN(p.price_cents)}
      </span>
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          soldOut || maxed ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
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
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <div className="flex h-8 w-9 items-center justify-center border-x border-border text-sm tabular-nums">
        {value}
      </div>
      <button
        onClick={onInc}
        disabled={!canInc}
        aria-label="Agregar uno"
        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
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
  const [categoria, setCategoria] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<"venta" | "prestamo">("venta");
  const [customer, setCustomer] = useState<PickerCustomer>(mostrador);
  const [note, setNote] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const byId = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products],
  );

  const categorias = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) if (p.category) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [products]);

  // Category filter → brand-alias search → in-stock first, capped.
  const results = useMemo(() => {
    const scoped = categoria
      ? products.filter((p) => p.category === categoria)
      : products;
    return searchProducts(scoped, query, {
      limit: GRID_LIMIT,
      tieBreak: (a, b) => Number(b.quantity > 0) - Number(a.quantity > 0),
    });
  }, [products, categoria, query]);

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
  function remove(id: string) {
    setCart((c) => {
      const { [id]: _omit, ...rest } = c;
      return rest;
    });
  }

  const canSubmit =
    lines.length > 0 && !(mode === "prestamo" && note.trim() === "");

  function submit(metodo?: PaymentMethod) {
    if (!canSubmit) return;
    const items = lines.map((l) => ({ product_id: l.product.id, qty: l.qty }));
    // Snapshot ticket data now — the cart is cleared before the user taps
    // "Imprimir" in the toast, so the closure must capture, not read state.
    const esFiado = mode === "prestamo";
    const pm: PaymentMethod = metodo ?? "efectivo";
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
    const ticketPago = esFiado ? null : pm;

    startTransition(async () => {
      try {
        const { saleId } = esFiado
          ? await registerLoan(items, note)
          : await registerSale(items, pm, customer.id);
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
          { action: { label: "Imprimir", onClick: () => imprimirTicketNavegador(ticket) } },
        );
        setCart({});
        setCustomer(mostrador);
        setNote("");
        setQuery("");
        setPaymentOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al registrar");
      }
    });
  }

  // Venta opens the payment sheet; fiado registers directly.
  function onCta() {
    if (!canSubmit) return;
    if (mode === "prestamo") submit();
    else setPaymentOpen(true);
  }

  const cta = mode === "prestamo" ? "Registrar fiado" : "Cobrar";

  return (
    <>
      <div className="gap-5 pb-28 lg:grid lg:grid-cols-5 lg:pb-0">
        {/* Product picker */}
        <div className="lg:col-span-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar producto (ej: moto g42, redmi note 7…)"
              className="h-12 rounded-xl pl-10 text-base"
            />
          </div>

          {/* Category chips */}
          {categorias.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <CatChip active={categoria === null} onClick={() => setCategoria(null)}>
                Todos
              </CatChip>
              {categorias.map((c) => (
                <CatChip
                  key={c}
                  active={categoria === c}
                  onClick={() => setCategoria(categoria === c ? null : c)}
                >
                  {c}
                </CatChip>
              ))}
            </div>
          )}

          {results.length === 0 ? (
            <div className="mt-3">
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">
                Sin resultados.
              </p>
              {query.trim() && (
                <CompatPanel
                  query={query}
                  products={products}
                  renderItem={(p) => (
                    <ProductRow key={p.id} p={p} inCart={cart[p.id] ?? 0} onAdd={() => add(p)} />
                  )}
                />
              )}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {results.map((p) => (
                <ProductCard key={p.id} p={p} inCart={cart[p.id] ?? 0} onAdd={() => add(p)} />
              ))}
            </div>
          )}
        </div>

        {/* Order panel */}
        <div className="mt-5 lg:col-span-2 lg:mt-0">
          <Card className="overflow-hidden lg:sticky lg:top-20">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
                <ShoppingCart className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-semibold">Orden actual</h2>
              <div className="ml-auto inline-flex rounded-lg bg-muted p-0.5 text-xs">
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
            </div>

            {lines.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  icon={ShoppingCart}
                  title="Orden vacía"
                  description="Toca un producto para agregarlo a la venta."
                  className="border-0 py-10"
                />
              </div>
            ) : (
              <>
                <ul className="max-h-[20rem] divide-y divide-border overflow-auto">
                  {lines.map((l) => (
                    <li key={l.product.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-border">
                        <Thumb src={l.product.image_url} alt={l.product.name} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{l.product.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatMXN(l.product.price_cents)} × {l.qty} ={" "}
                          <span className="font-semibold text-accent">
                            {formatMXN(l.product.price_cents * l.qty)}
                          </span>
                        </p>
                        <div className="mt-1.5">
                          <Stepper
                            value={l.qty}
                            onDec={() => setQty(l.product.id, l.qty - 1)}
                            onInc={() => setQty(l.product.id, l.qty + 1)}
                            canInc={l.qty < l.product.quantity}
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => remove(l.product.id)}
                        aria-label={`Quitar ${l.product.name}`}
                        className="shrink-0 cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>

                <div className="space-y-3 border-t border-border p-4">
                  {mode === "venta" ? (
                    <CustomerPicker customers={customers} value={customer} onChange={setCustomer} />
                  ) : (
                    <Input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="¿A quién? Ej: Ernesto · Local 87"
                    />
                  )}

                  <div className="space-y-1.5 border-t border-dashed border-border pt-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Artículos</span>
                      <span className="tabular-nums">{count}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-medium">Total</span>
                      <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
                        {formatMXN(total)}
                      </span>
                    </div>
                  </div>

                  {/* Desktop action — mobile uses the fixed bottom bar */}
                  <Button
                    variant="accent"
                    size="lg"
                    className="hidden w-full lg:flex"
                    onClick={onCta}
                    loading={pending}
                    disabled={!canSubmit}
                  >
                    <Check className="h-4 w-4" />
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
              onClick={onCta}
              loading={pending}
              disabled={!canSubmit}
            >
              {cta}
            </Button>
          </div>
        </div>
      )}

      <PaymentSheet
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        total={total}
        pending={pending}
        onConfirm={(metodo) => submit(metodo)}
      />
    </>
  );
}

function CatChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition-colors",
        active
          ? "bg-accent text-white shadow-sm shadow-accent/25"
          : "border border-border bg-background text-muted-foreground hover:border-ring/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
