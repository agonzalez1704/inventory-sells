"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Plus, Minus, Package, Trash2, FileText } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { buscarProductos } from "@/modules/inventory/buscar";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CustomerPicker, type PickerCustomer } from "@/modules/customers/CustomerPicker";
import type { SalesProduct } from "@/modules/sales/SalesScreen";
import { AnimatePresence, m } from "framer-motion";
import NumberFlow from "@number-flow/react";
import { Motion } from "@/components/ui/motion";
import { ProductoSheet } from "@/modules/sales/ProductoSheet";
import { useLongPress } from "@/modules/sales/useLongPress";
import { crearCotizacion, editarCotizacion } from "./actions";

const GRID_LIMIT = 24;

export type CotizacionInicial = {
  id: string;
  items: { product_id: string; qty: number }[];
  customerId: string | null;
  notas: string;
};

// The card, wrapped so a long press opens the detail sheet instead of adding a
// line — the same gesture the register has. Its own component because the hook
// cannot be called inside the .map() that renders the grid.
function TarjetaProducto({
  onAdd,
  onVerDetalle,
  children,
}: {
  onAdd: () => void;
  onVerDetalle: () => void;
  children: React.ReactNode;
}) {
  const { handlers, consumioElTap } = useLongPress(onVerDetalle);
  return (
    <m.button
      // Same motion as the register: results arrive rather than appear, and the
      // 2px lift moves from CSS to framer because framer owns `transform` once
      // it animates y.
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      whileHover={{ y: -2 }}
      onClick={() => {
        if (consumioElTap()) return;
        onAdd();
      }}
      {...handlers}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
      className="group relative flex flex-col rounded-2xl border border-border bg-background p-2.5 text-left transition-all hover:border-ring/40 hover:shadow-md hover:shadow-black/5"
    >
      {children}
    </m.button>
  );
}

function Thumb({ src, alt }: { src?: string | null; alt: string }) {
  if (src)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading="lazy" className="h-full w-full object-contain" />;
  return (
    <span className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground">
      <Package className="h-5 w-5" />
    </span>
  );
}

export function CotizacionBuilder({
  products,
  productosDeLaCotizacion = [],
  customers,
  verCostos = false,
  initial,
  vendedores = [],
  puedeAsignar = false,
}: {
  /** First page of the catalog, shown before any search. */
  products: SalesProduct[];
  /**
   * The products this quote already contains, when editing.
   *
   * The catalog is no longer shipped whole, so a line whose product happens to
   * fall outside the first page would have no entry to resolve against and the
   * item would vanish from the editor — silently, and saving would then drop it
   * from the quote.
   */
  productosDeLaCotizacion?: SalesProduct[];
  customers: PickerCustomer[];
  /** Gates cost and margin in the detail sheet, like everywhere else. */
  verCostos?: boolean;
  initial?: CotizacionInicial;
  vendedores?: { id: string; nombre: string }[];
  puedeAsignar?: boolean;
}) {
  const router = useRouter();
  const mostrador = useMemo(() => customers.find((c) => c.is_system) ?? customers[0], [customers]);

  // Every product this builder has seen: the first page, whatever the quote
  // already had, and anything a later search brings back.
  const [conocidos, setConocidos] = useState<Record<string, SalesProduct>>(() =>
    Object.fromEntries([...products, ...productosDeLaCotizacion].map((p) => [p.id, p])),
  );
  const recordar = useCallback((ps: SalesProduct[]) => {
    setConocidos((prev) => {
      const next = { ...prev };
      for (const p of ps) next[p.id] = p;
      return next;
    });
  }, []);
  const byId = conocidos;

  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<Record<string, number>>(
    () => Object.fromEntries((initial?.items ?? []).map((i) => [i.product_id, i.qty])),
  );
  const [customer, setCustomer] = useState<PickerCustomer>(
    () => (initial?.customerId && customers.find((c) => c.id === initial.customerId)) || mostrador,
  );
  const [notas, setNotas] = useState(initial?.notas ?? "");
  const [vendedorId, setVendedorId] = useState("");
  const [pending, startTransition] = useTransition();

  // Vendedor picker only when creating and the user may assign; editing keeps
  // assignment to the detail's reassign control.
  const mostrarVendedor = !initial && puedeAsignar && vendedores.length > 0;

  // Quote lines are not stock-bound (no reserve until conversion) — allow any qty
  // the seller types, catalog stock is only a hint shown on the card.
  //
  // Searching happens in the database: the catalog is 21k products at the
  // refaccionaria, too big to hand the browser and re-filter per keystroke.
  const [results, setResults] = useState<SalesProduct[]>(products);
  const [detalle, setDetalle] = useState<SalesProduct | null>(null);
  useEffect(() => {
    let cancelado = false;
    const t = setTimeout(async () => {
      try {
        const rows = (await buscarProductos({ query, limit: GRID_LIMIT })) as SalesProduct[];
        if (cancelado) return;
        setResults(rows);
        recordar(rows);
      } catch {
        if (!cancelado) setResults([]);
      }
    }, 180);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [query, recordar]);

  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ product: byId[id], qty }))
    .filter((l) => l.product);
  const total = lines.reduce((s, l) => s + l.product.price_cents * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  function add(id: string) {
    setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  }
  function setQty(id: string, qty: number) {
    setCart((c) => {
      if (qty <= 0) {
        const { [id]: _omit, ...rest } = c;
        return rest;
      }
      return { ...c, [id]: qty };
    });
  }

  function guardar(estado: "borrador" | "pendiente") {
    if (lines.length === 0) return;
    const items = lines.map((l) => ({ product_id: l.product.id, qty: l.qty }));
    const customerId = customer.is_system ? null : customer.id;
    startTransition(async () => {
      if (initial) {
        const res = await editarCotizacion(initial.id, items, notas);
        if (!res.ok) return void toast.error(res.error);
        toast.success("Cotización actualizada");
        router.push(`/cotizaciones/${initial.id}`);
      } else {
        const res = await crearCotizacion(items, customerId, vendedorId || null, notas, "mostrador", estado);
        if (!res.ok) return void toast.error(res.error);
        toast.success(`Cotización ${res.data.folio} creada`);
        router.push("/cotizaciones");
      }
      router.refresh();
    });
  }

  const vacio = lines.length === 0;
  const actionButtons = initial ? (
    <Button
      variant="accent"
      size="lg"
      className="w-full"
      onClick={() => guardar("pendiente")}
      loading={pending}
      disabled={vacio}
    >
      Guardar cambios
    </Button>
  ) : (
    <>
      <Button
        variant="secondary"
        size="lg"
        className="flex-1"
        onClick={() => guardar("borrador")}
        disabled={pending || vacio}
      >
        Borrador
      </Button>
      <Button
        variant="accent"
        size="lg"
        className="flex-[2]"
        onClick={() => guardar("pendiente")}
        loading={pending}
        disabled={vacio}
      >
        {vacio ? "Crear cotización" : `Crear · ${formatMXN(total)}`}
      </Button>
    </>
  );

  return (
    <Motion>
    <div className="gap-5 pb-28 lg:grid lg:grid-cols-5 lg:pb-0">
      {/* Product picker */}
      <div className="lg:col-span-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto para cotizar…"
            className="h-12 rounded-xl pl-10 text-base"
          />
        </div>

        {results.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">Sin resultados.</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {results.map((p) => {
              const inCart = cart[p.id] ?? 0;
              return (
                <TarjetaProducto
                  key={p.id}
                  onAdd={() => add(p.id)}
                  onVerDetalle={() => setDetalle(p)}
                >
                  {inCart > 0 && (
                    <span className="absolute right-4 top-4 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-white shadow-sm">
                      {inCart}
                    </span>
                  )}
                  <div className="relative mb-2 aspect-square overflow-hidden rounded-xl bg-background">
                    <Thumb src={p.image_url} alt={p.name} />
                    <span className="absolute bottom-1.5 right-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-110">
                      <Plus className="h-4 w-4" />
                    </span>
                  </div>
                  {/* The part number, first and unmissable. Searching "SHN07"
                      returns the 721 and the 712 of the same family, and the
                      code is the only thing that tells them apart — the names
                      differ by a word buried mid-string. */}
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {p.sku}
                  </p>
                  <p className="line-clamp-2 min-h-[2.25rem] text-sm font-medium leading-tight">{p.name}</p>
                  <div className="mt-1 flex items-center justify-between gap-1">
                    <span className="font-mono text-sm font-semibold tabular-nums text-accent">
                      {formatMXN(p.price_cents)}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{p.quantity} disp.</span>
                  </div>
                </TarjetaProducto>
              );
            })}
          </div>
        )}
      </div>

      {/* Quote panel */}
      <div className="mt-5 lg:col-span-2 lg:mt-0">
        <Card className="overflow-hidden lg:sticky lg:top-20">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <FileText className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold">{initial ? "Editar cotización" : "Nueva cotización"}</h2>
          </div>

          {/* Same as the register: only the list is swapped out, so the totals
              stay mounted at zero and the first line added has a number to
              count up from. */}
          {lines.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={FileText}
                title="Cotización vacía"
                description="Toca un producto para agregarlo."
                className="border-0 py-10"
              />
            </div>
          ) : (
            <ul className="max-h-[20rem] divide-y divide-border overflow-auto">
                {/* initial={false}: lines restored when editing an existing
                    quote are not new. popLayout so removing one lets the rest
                    close the gap. */}
                <AnimatePresence initial={false} mode="popLayout">
                {lines.map((l) => (
                  <m.li
                    key={l.product.id}
                    layout
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ opacity: { duration: 0.2 }, layout: { duration: 0.2 } }}
                    className="flex gap-3 px-4 py-3"
                  >
                    <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border">
                      <Thumb src={l.product.image_url} alt={l.product.name} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{l.product.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                            {formatMXN(l.product.price_cents)} c/u
                          </p>
                        </div>
                        <m.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => setQty(l.product.id, 0)}
                          aria-label={`Quitar ${l.product.name}`}
                          className="-mr-1 -mt-1 shrink-0 cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 dark:bg-red-950/40 hover:text-red-600 dark:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </m.button>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="inline-flex items-center overflow-hidden rounded-lg border border-border">
                          <m.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setQty(l.product.id, l.qty - 1)}
                            aria-label="Quitar uno"
                            className="flex h-8 w-9 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-muted"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </m.button>
                          <div className="flex h-8 min-w-9 items-center justify-center border-x border-border px-1 text-sm font-medium tabular-nums">
                            <NumberFlow value={l.qty} />
                          </div>
                          <m.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setQty(l.product.id, l.qty + 1)}
                            aria-label="Agregar uno"
                            className="flex h-8 w-9 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-muted"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </m.button>
                        </div>
                        <span className="text-sm font-semibold tabular-nums text-accent">
                          {formatMXN(l.product.price_cents * l.qty)}
                        </span>
                      </div>
                    </div>
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
          )}

          <div className="space-y-3 border-t border-border p-4">
              <CustomerPicker customers={customers} value={customer} onChange={setCustomer} />
              {mostrarVendedor && (
                <select
                  value={vendedorId}
                  onChange={(e) => setVendedorId(e.target.value)}
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  aria-label="Asignar vendedor"
                >
                  <option value="">Asignar vendedor (opcional)</option>
                  {vendedores.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nombre}
                    </option>
                  ))}
                </select>
              )}
              <Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas (opcional)" />

              <div className="space-y-1.5 border-t border-dashed border-border pt-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Artículos</span>
                  <span className="tabular-nums">
                    <NumberFlow value={count} />
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">Total</span>
                  <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
                    <NumberFlow
                      value={total / 100}
                      locales="es-MX"
                      format={{ style: "currency", currency: "MXN" }}
                    />
                  </span>
                </div>
              </div>
            </div>

          {/* Desktop actions live inside the sticky panel and are ALWAYS shown
              (disabled while empty) — never buried at the end of a long product
              scroll, never invisible. */}
          <div className="hidden gap-2 border-t border-border p-4 lg:flex">{actionButtons}</div>
        </Card>
      </div>

      {/* Fixed bottom bar — mobile/narrow only (desktop actions live in the
          sticky panel). Always shown so the CTA never disappears below the
          single-column product grid; disabled while the cart is empty. */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {actionButtons}
      </div>

      <ProductoSheet
        p={detalle}
        verCostos={verCostos}
        onClose={() => setDetalle(null)}
        onAgregar={(prod) => add(prod.id)}
      />
    </div>
    </Motion>
  );
}
