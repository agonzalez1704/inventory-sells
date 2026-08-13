"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useQueryState, parseAsString } from "nuqs";
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
import { buscarProductos } from "@/modules/inventory/buscar";
import type { PaymentMethod, PaymentMethodVenta, Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { imprimirTicketNavegador, type TicketData } from "@/lib/ticket";
import { CustomerPicker, type PickerCustomer } from "@/modules/customers/CustomerPicker";
import { CompatPanel } from "@/modules/compat/CompatPanel";
import { AnimatePresence, m } from "framer-motion";
import NumberFlow from "@number-flow/react";
import { Motion } from "@/components/ui/motion";
import { PaymentSheet } from "./PaymentSheet";
import { ProductoSheet } from "./ProductoSheet";
import { CategoriaSheet } from "./CategoriaSheet";
import type { CategoriaConteo } from "@/modules/inventory/buscar";
import { useLongPress } from "./useLongPress";
import type { PrecioBase } from "./pos-prefs";
import { registerSale, registerLoan, type PagoSplit } from "./actions";
import { saldoDeCliente } from "@/modules/garantias/cliente-actions";

export type SalesProduct = Pick<
  Product,
  "id" | "sku" | "name" | "brand" | "size" | "category" | "price_cents" | "quantity"
> & {
  inventory_name?: string | null;
  image_url?: string | null;
  /** Absent, or 0, for a reader who may not see costs — the server strips it. */
  cost_cents?: number;
  etiqueta?: string | null;
};

const GRID_LIMIT = 30;

export function Thumb({
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

// Grid card (photo-first) — the whole card adds to the order, and holding it
// opens the detail sheet instead.
function ProductCard({
  p,
  inCart,
  onAdd,
  onVerDetalle,
  precioBase,
}: {
  p: SalesProduct;
  inCart: number;
  onAdd: () => void;
  onVerDetalle: () => void;
  precioBase: PrecioBase;
}) {
  const soldOut = p.quantity === 0;
  const maxed = inCart >= p.quantity;
  const { handlers, consumioElTap } = useLongPress(onVerDetalle);
  const alCosto = precioBase === "costo";
  const importe = alCosto ? p.cost_cents ?? 0 : p.price_cents;
  return (
    <m.button
      // Results fade up as they arrive instead of snapping in mid-search.
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      // The lift used to be hover:-translate-y-0.5. Framer owns `transform`
      // once it animates y, so a CSS translate on the same element would be
      // overwritten — same 2px, moved to where it still works.
      whileHover={soldOut || maxed ? undefined : { y: -2 }}
      // A long press already opened the sheet; the click it leaves behind must
      // not also drop the product into the sale.
      onClick={() => {
        if (consumioElTap()) return;
        onAdd();
      }}
      {...handlers}
      // Without this the browser's own text-selection callout fires at the same
      // time and the sheet opens under a selection handle.
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
      disabled={soldOut || maxed}
      className={cn(
        "group relative flex flex-col rounded-2xl border border-border bg-background p-2.5 text-left transition-all",
        soldOut
          ? "opacity-60"
          : "cursor-pointer hover:border-ring/40 hover:shadow-md hover:shadow-black/5",
      )}
    >
      {inCart > 0 && (
        <span className="absolute right-4 top-4 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-white shadow-sm">
          {inCart}
        </span>
      )}
      <div className="relative mb-2 aspect-square overflow-hidden rounded-xl bg-background">
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
      {/* The part number, first and unmissable. Searching "SHN07" returns the
          721 and the 712 of the same family, and the code is the only thing
          that tells them apart — the names differ by a word buried mid-string,
          which is no use when you are scanning a grid. */}
      <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {p.sku}
      </p>
      <p className="line-clamp-2 min-h-[2.25rem] text-sm font-medium leading-tight">
        {p.name}
      </p>
      {(p.brand || p.category) && (
        <p className="mt-0.5 truncate text-xs capitalize text-muted-foreground">
          {[p.brand, p.category].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="mt-1 flex items-center justify-between gap-1">
        {importe ? (
          <span
            className={cn(
              "font-mono text-sm font-semibold tabular-nums",
              // Cost is a different number with the same shape as the price,
              // and confusing the two at the counter charges the wrong amount.
              // Different colour and an explicit label, not just a swap.
              alCosto ? "text-amber-700 dark:text-amber-400" : "text-accent",
            )}
          >
            {alCosto && <span className="mr-1 text-[10px] font-medium uppercase">costo</span>}
            {formatMXN(importe)}
          </span>
        ) : (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300">
            Sin precio
          </span>
        )}
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {soldOut ? "—" : `${p.quantity} disp.`}
        </span>
      </div>
    </m.button>
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
        {/* The code was only a fallback here. On a line the seller is about to
            charge for, it is the thing they check against the shelf. */}
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-mono font-medium uppercase">{p.sku}</span>
          {[p.brand, p.category].filter(Boolean).length > 0 && (
            <span className="capitalize">
              {" · "}
              {[p.brand, p.category].filter(Boolean).join(" · ")}
            </span>
          )}
        </p>
      </div>
      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
        {p.price_cents ? (
          formatMXN(p.price_cents)
        ) : (
          <span className="font-sans text-xs font-medium text-amber-700 dark:text-amber-300">
            Sin precio
          </span>
        )}
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
    // inline-flex, not flex: a block-level flex box stretches to the full width
    // of its parent, so the fixed-width buttons packed left and left a big empty
    // bordered gap to the right. inline-flex sizes the control to its contents.
    <div className="inline-flex items-center overflow-hidden rounded-lg border border-border">
      <m.button
        whileTap={{ scale: 0.95 }}
        onClick={onDec}
        aria-label="Quitar uno"
        className="flex h-8 w-9 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-muted active:bg-muted"
      >
        <Minus className="h-3.5 w-3.5" />
      </m.button>
      {/* The number rolls rather than swapping, so a mistaken double-tap is
          visible as movement instead of a digit that was already different. */}
      <div className="flex h-8 min-w-9 items-center justify-center border-x border-border px-1 text-sm font-medium tabular-nums">
        <NumberFlow value={value} />
      </div>
      <m.button
        whileTap={{ scale: 0.95 }}
        onClick={onInc}
        disabled={!canInc}
        aria-label="Agregar uno"
        className="flex h-8 w-9 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:bg-muted active:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
      </m.button>
    </div>
  );
}

export function SalesScreen({
  products,
  categorias,
  customers,
  verCostos,
  precioBase,
}: {
  /** First page of the catalog, rendered before any search runs. */
  products: SalesProduct[];
  /** Counted in SQL — deriving these needs the whole catalog, which is the
   *  thing we stopped shipping. The count is what decides which ones are worth
   *  a chip: Ruli has 216 and they are opaque ERP codes. */
  categorias: CategoriaConteo[];
  customers: PickerCustomer[];
  /** Gates cost and margin in the detail sheet — the same permiso as elsewhere. */
  verCostos: boolean;
  /** This user's own choice of which figure the cards show. */
  precioBase: PrecioBase;
}) {
  const router = useRouter();
  const mostrador = useMemo(
    () => customers.find((c) => c.is_system) ?? customers[0],
    [customers],
  );
  // The search box lives in the URL so a refresh — including the one a new
  // deploy forces mid-sale — doesn't wipe what the seller was looking for.
  const [query, setQuery] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions({ history: "replace" }),
  );
  const [categoria, setCategoria] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<"venta" | "prestamo">("venta");
  const [customer, setCustomer] = useState<PickerCustomer>(mostrador);
  const [note, setNote] = useState("");
  // Held open by the card the seller pressed, not by an id: the grid re-reads
  // itself from the server while the sheet is open, and an id would point at a
  // row that is no longer in the page.
  const [detalle, setDetalle] = useState<SalesProduct | null>(null);
  // Read per customer, not once: the seller switches customer mid-sale and the
  // credit belongs to whoever is standing there now.
  const [saldo, setSaldo] = useState(0);
  const [catsAbiertas, setCatsAbiertas] = useState(false);

  // Chips are for the categories people actually reach for. On Ruli the twelve
  // biggest cover 16,680 of 19,237 products — 87% — and rendering all 216 is
  // what buried the product grid under a wall of five-letter codes.
  //
  // The selected one is pinned in even when it is not in the top twelve, or
  // picking from the sheet would leave nothing on screen showing what is on.
  const CHIPS = 12;
  const chips = useMemo(() => {
    const orden = [...categorias].sort(
      (a, b) => b.productos - a.productos || a.categoria.localeCompare(b.categoria, "es"),
    );
    const top = orden.slice(0, CHIPS);
    if (categoria && !top.some((c) => c.categoria === categoria)) {
      const elegida = orden.find((c) => c.categoria === categoria);
      if (elegida) return [elegida, ...top.slice(0, CHIPS - 1)];
    }
    return top;
  }, [categorias, categoria]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [results, setResults] = useState<SalesProduct[]>(products);
  const [buscando, setBuscando] = useState(false);

  // Every product the register has ever shown this session. The cart holds ids,
  // and results are now a page of the catalog rather than all of it — without
  // this, changing the search would drop items out of the open sale.
  const [conocidos, setConocidos] = useState<Record<string, SalesProduct>>(() =>
    Object.fromEntries(products.map((p) => [p.id, p])),
  );
  const recordar = useCallback((ps: SalesProduct[]) => {
    setConocidos((prev) => {
      const next = { ...prev };
      for (const p of ps) next[p.id] = p;
      return next;
    });
  }, []);
  const byId = conocidos;

  // Search runs in the database now: at 21k products the catalog is too big to
  // ship to the browser, let alone re-filter on every keystroke. Debounced so
  // typing costs one query, not one per character.
  useEffect(() => {
    let cancelado = false;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const rows = (await buscarProductos({
          query,
          categoria,
          limit: GRID_LIMIT,
        })) as SalesProduct[];
        if (cancelado) return;
        setResults(rows);
        recordar(rows);
      } catch {
        if (!cancelado) setResults([]);
      } finally {
        if (!cancelado) setBuscando(false);
      }
    }, 180);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
    // Same reason as the inventory list: this grid feeds itself from the server
    // now, so the router.refresh() after a sale never reached it and the card
    // kept showing the stock the shelf had before the sale. A refresh re-runs the
    // server component and hands down a new `products` array — that is the cue.
  }, [query, categoria, recordar, products]);

  const buscarCompat = useCallback(async (modelo: string) => {
    const rows = (await buscarProductos({ query: modelo, limit: 4 })) as SalesProduct[];
    recordar(rows);
    return rows;
  }, [recordar]);

  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ product: byId[id], qty }))
    .filter((l) => l.product);
  const total = lines.reduce((s, l) => s + l.product.price_cents * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  function add(p: SalesProduct) {
    // Imported catalogs carry products their ERP never priced. They have to be
    // visible — staff need to see the part exists — but the database rejects a
    // sale line at zero, so stop it here with an answer instead of an error.
    if (!p.price_cents) {
      toast.error(`${p.name} no tiene precio. Asígnalo en Inventario.`);
      return;
    }
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

  // A credit note is a debt, so it needs a real customer — "Mostrador" is the
  // walk-in placeholder, not a person. The note used to stand in for the
  // customer and was therefore required; now it is just an optional reminder.
  const clienteReal = !customer.is_system;

  // Mostrador can never hold credit, so it is not even asked for. Cleared on
  // every switch before the fetch lands: showing the previous customer's credit
  // for a beat is how the wrong person spends it.
  useEffect(() => {
    setSaldo(0);
    if (customer.is_system) return;
    let cancelado = false;
    saldoDeCliente(customer.id)
      .then((c) => !cancelado && setSaldo(c))
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [customer.id, customer.is_system]);
  const canSubmit = lines.length > 0 && !(mode === "prestamo" && !clienteReal);

  function submit(metodo?: PaymentMethodVenta, pagos?: PagoSplit[]) {
    if (!canSubmit) return;
    const items = lines.map((l) => ({ product_id: l.product.id, qty: l.qty }));
    // Snapshot ticket data now — the cart is cleared before the user taps
    // "Imprimir" in the toast, so the closure must capture, not read state.
    const esFiado = mode === "prestamo";
    const pm: PaymentMethodVenta = metodo ?? "efectivo";
    const ticketItems = lines.map((l) => ({
      nombre: l.product.name,
      qty: l.qty,
      precioUnit: l.product.price_cents,
      total: l.product.price_cents * l.qty,
    }));
    const ticketTotal = total;
    const ticketCliente = customer.is_system ? null : customer.nombre;
    const ticketPago = esFiado ? null : pm;

    startTransition(async () => {
      try {
        const { saleId } = esFiado
          ? await registerLoan(items, customer.id, note)
          : await registerSale(items, pm, customer.id, pagos);
        const ticket: TicketData = {
          folio: saleId,
          fecha: new Date().toISOString(),
          items: ticketItems,
          total: ticketTotal,
          metodoPago: ticketPago,
          cliente: ticketCliente,
          tipo: esFiado ? "fiado" : "venta",
        };
        // What was spent of the credit, and what is left. The point of a
        // partial spend is that the rest stays with the customer, and the
        // seller has to be able to tell them so before they walk out.
        const usoSaldo = (pagos ?? []).find((p) => p.metodo === "saldo")?.monto_cents ?? 0;
        const restante = Math.max(0, saldo - usoSaldo);
        toast.success(
          `${esFiado ? "Nota de crédito registrada" : "Venta registrada"} · ${formatMXN(ticketTotal)}` +
            (usoSaldo > 0
              ? ` · ${formatMXN(usoSaldo)} de saldo${restante > 0 ? `, le quedan ${formatMXN(restante)}` : ""}`
              : ""),
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

  const cta = mode === "prestamo" ? "Registrar crédito" : "Cobrar";

  return (
    <Motion>
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

          {/* One scrolling line, never a wrapping block: this row must not be
              allowed to grow, whether the shop has 6 categories or 216. */}
          {categorias.length > 1 && (
            <div className="mt-3 flex items-center gap-1.5">
              <div className="flex flex-1 gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <CatChip active={categoria === null} onClick={() => setCategoria(null)}>
                  Todos
                </CatChip>
                {chips.map((c) => (
                  <CatChip
                    key={c.categoria}
                    active={categoria === c.categoria}
                    onClick={() =>
                      setCategoria(categoria === c.categoria ? null : c.categoria)
                    }
                  >
                    {c.categoria}
                  </CatChip>
                ))}
              </div>
              {categorias.length > CHIPS && (
                <button
                  onClick={() => setCatsAbiertas(true)}
                  className="shrink-0 cursor-pointer rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-ring/40 hover:text-foreground"
                >
                  Todas ({categorias.length})
                </button>
              )}
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
                  buscar={buscarCompat}
                  renderItem={(p) => (
                    <ProductRow key={p.id} p={p} inCart={cart[p.id] ?? 0} onAdd={() => add(p)} />
                  )}
                />
              )}
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {results.map((p) => (
                <ProductCard
                  key={p.id}
                  p={p}
                  inCart={cart[p.id] ?? 0}
                  onAdd={() => add(p)}
                  onVerDetalle={() => setDetalle(p)}
                  precioBase={precioBase}
                />
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
                    {m === "venta" ? "Venta" : "Crédito"}
                  </button>
                ))}
              </div>
            </div>

            {/* Only the LIST is swapped for the empty state. The totals below
                stay mounted at zero: a bar that appears already reading $1,240
                has nothing to count up from, so the first product added was the
                one whose total never animated. It also reads better — the panel
                says what it is for before it holds anything. */}
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
              <ul className="max-h-[20rem] divide-y divide-border overflow-auto">
                  {/* initial={false}: lines already in the order when the panel
                      mounts are not new, and animating them would replay the
                      whole cart on every re-render. popLayout so a removed line
                      leaves while the ones under it slide up. */}
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
                        {/* Name + delete on one row so the trash reads as this
                            line's, not a control floating off in the margin. */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{l.product.name}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                              {formatMXN(l.product.price_cents)} c/u
                            </p>
                          </div>
                          <m.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => remove(l.product.id)}
                            aria-label={`Quitar ${l.product.name}`}
                            className="-mr-1 -mt-1 shrink-0 cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 dark:bg-red-950/40 hover:text-red-600 dark:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </m.button>
                        </div>
                        {/* Stepper left, running line total right — the total
                            sits where the eye lands after changing quantity. */}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <Stepper
                            value={l.qty}
                            onDec={() => setQty(l.product.id, l.qty - 1)}
                            onInc={() => setQty(l.product.id, l.qty + 1)}
                            canInc={l.qty < l.product.quantity}
                          />
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
                {mode === "prestamo" && (
                  <>
                    <Input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Nota (opcional): plazo, referencia…"
                    />
                    {!clienteReal && (
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Un crédito necesita cliente registrado. Elige o crea uno arriba.
                      </p>
                    )}
                  </>
                )}

                <div className="space-y-1.5 border-t border-dashed border-border pt-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Artículos</span>
                    <span className="tabular-nums">
                      <NumberFlow value={count} />
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium">Total</span>
                    {/* Same formatter as formatMXN — es-MX currency — so the
                        rolling total reads identically to every other amount
                        on the screen. Cents, because that is how it is held. */}
                    <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
                      <NumberFlow
                        value={total / 100}
                        locales="es-MX"
                        format={{ style: "currency", currency: "MXN" }}
                      />
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
            </Card>
        </div>
      </div>

      {/* Fixed mobile checkout bar.
          Always mounted, like the quote builder's. It used to appear with the
          first product, which meant its total arrived already written and never
          rolled — the same reason the panel's total was moved out of the
          conditional. The grid's pb-28 already reserved this space whether the
          bar was there or not, so nothing shifts. */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="leading-tight">
            <p className="text-xs text-muted-foreground">
              <NumberFlow value={count} /> art. ·{" "}
              {mode === "prestamo" ? "Crédito" : "Total"}
            </p>
            <p className="font-mono text-lg font-semibold tabular-nums">
              <NumberFlow
                value={total / 100}
                locales="es-MX"
                format={{ style: "currency", currency: "MXN" }}
              />
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

      <PaymentSheet
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        total={total}
        pending={pending}
        saldoDisponible={saldo}
        onConfirm={(metodo, pagos) => submit(metodo, pagos)}
      />

      {catsAbiertas && (
        <CategoriaSheet
          categorias={categorias}
          activa={categoria}
          onPick={setCategoria}
          onClose={() => setCatsAbiertas(false)}
        />
      )}

      <ProductoSheet
        p={detalle}
        verCostos={verCostos}
        onClose={() => setDetalle(null)}
        onAgregar={add}
      />
    </>
    </Motion>
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
        "shrink-0 cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition-colors",
        active
          ? "bg-accent text-white shadow-sm shadow-accent/25"
          : "border border-border bg-background text-muted-foreground hover:border-ring/40 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
