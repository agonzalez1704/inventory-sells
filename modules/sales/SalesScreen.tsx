"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useQueryState, parseAsString } from "nuqs";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import NumberFlow from "@number-flow/react";
import {
  Banknote,
  FileText,
  Loader2,
  Minus,
  Package,
  Plus,
  Printer,
  QrCode,
  Search,
  ShoppingCart,
  Tag,
  Trash2,
  Wallet,
} from "lucide-react";
import { conDescuento, formatMXN } from "@/lib/money";
import { foto } from "@/lib/foto";
import { cn } from "@/lib/utils";
import type { PaymentMethodVenta, Product } from "@/lib/types";
import { imprimirTicketNavegador, type TicketData } from "@/lib/ticket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarraInferior } from "@/components/ui/barra-inferior";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useConfirm } from "@/components/ui/use-confirm";
import { CustomerPicker, type PickerCustomer } from "@/modules/customers/CustomerPicker";
import { ResumenClienteChip } from "@/modules/customers/ResumenClienteChip";
import { CompatPanel } from "@/modules/compat/CompatPanel";
import { buscarProductos, productosPorId, type CategoriaConteo } from "@/modules/inventory/buscar";
import { EscanerQR } from "@/modules/inventory/EscanerQR";
import { idDeCodigo } from "@/modules/inventory/qr";
import { saldoDeCliente } from "@/modules/garantias/cliente-actions";
import { misInventariosAjenos } from "@/modules/sucursales/actions";
import { crearCotizacion } from "@/modules/cotizaciones/actions";
import { guardarComprobante } from "./comprobantes";
import { PaymentSheet, type Comprobante } from "./PaymentSheet";
import { ApartarPanel } from "./ApartarPanel";
import { ReciboImpreso } from "./ReciboImpreso";
import { ProductoSheet } from "./ProductoSheet";
import { CategoriaSheet } from "./CategoriaSheet";
import { useLongPress } from "./useLongPress";
import type { PrecioBase } from "./pos-prefs";
import { registerSale, registerLoan, type PagoSplit } from "./actions";

export type SalesProduct = Pick<
  Product,
  "id" | "sku" | "name" | "brand" | "size" | "category" | "price_cents" | "quantity"
> & {
  inventory_id?: string;
  inventory_name?: string | null;
  /** Set when this stock sits at another sucursal: shown, not sellable here. */
  sucursal_ajena?: string | null;
  image_url?: string | null;
  /** Absent, or 0, for a reader who may not see costs — the server strips it. */
  cost_cents?: number;
  etiqueta?: string | null;
};

export type PosCustomer = PickerCustomer & { descuento_pct?: number | null };

const GRID_LIMIT = 30;
const CHIPS = 12;
// The open sale survives a refresh — including the one a deploy forces
// mid-sale. Per device: the counter laptop and a phone are different tills.
const LS_VENTA = "pos_venta_v1";
const LS_ULTIMA = "pos_ultima_venta_v1";
const DESCUENTOS = [5, 10, 15, 20];

type Guardado = {
  cart: Record<string, number>;
  customerId: string | null;
  mode: "venta" | "prestamo";
  note: string;
  descManual: number | null;
};
type Ultima = { ticket: TicketData };

function leer<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function escribir(k: string, v: unknown) {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    // Private mode / blocked storage: the sale still works, it just won't
    // survive a refresh.
  }
}

export function Thumb({ src, alt, className }: { src?: string | null; alt: string; className?: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={foto(src, 256)} alt={alt} loading="lazy" className={cn("h-full w-full object-contain", className)} />
    );
  }
  return (
    <span className="flex h-full w-full items-center justify-center bg-muted text-muted-foreground/50">
      <Package className="h-7 w-7" />
    </span>
  );
}

// Photo-first card: the + adds, the card body adds too (or opens the detail,
// per the shop's setting), and holding it always opens the detail.
function ProductCard({
  p,
  inCart,
  onAdd,
  onVerDetalle,
  precioBase,
  clickAbreDetalle,
}: {
  p: SalesProduct;
  inCart: number;
  onAdd: () => void;
  onVerDetalle: () => void;
  precioBase: PrecioBase;
  clickAbreDetalle: boolean;
}) {
  const soldOut = p.quantity === 0;
  const maxed = inCart >= p.quantity;
  const { handlers, consumioElTap } = useLongPress(onVerDetalle);
  const alCosto = precioBase === "costo";
  const importe = alCosto ? (p.cost_cents ?? 0) : p.price_cents;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        if (consumioElTap()) return;
        if (clickAbreDetalle) return onVerDetalle();
        if (!soldOut && !maxed) onAdd();
      }}
      onKeyDown={(e) => e.key === "Enter" && e.target === e.currentTarget && onAdd()}
      {...handlers}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-background text-left shadow-xs transition-[border-color,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        inCart ? "border-foreground" : "border-border hover:border-foreground/30 hover:shadow-card",
        soldOut && "opacity-60",
      )}
    >
      {inCart > 0 && (
        <span className="absolute top-2 left-2 z-10 flex h-6 min-w-6 items-center justify-center rounded-full bg-foreground px-1.5 text-xs font-semibold text-background tabular-nums">
          {inCart}
        </span>
      )}
      <div className="relative aspect-square bg-muted/60">
        <Thumb src={p.image_url} alt={p.name} className="transition-transform duration-300 group-hover:scale-105" />
        {soldOut ? (
          <span className="absolute inset-x-0 bottom-0 bg-red-600/90 py-0.5 text-center text-[11px] font-semibold text-white">Agotado</span>
        ) : (
          !maxed && (
            <button
              type="button"
              aria-label={`Agregar ${p.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onAdd();
              }}
              className="absolute right-2 bottom-2 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-pop transition-transform active:scale-95 group-hover:scale-105"
            >
              <Plus className="h-5 w-5" />
            </button>
          )
        )}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 px-2.5 pt-2 pb-2.5">
        {/* The part number tells apart the 721 and the 712 of one family —
            the names differ by a word buried mid-string. */}
        <p className="flex items-center justify-between gap-1 font-mono text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          <span className="truncate">{p.sku}</span>
          {p.sucursal_ajena && (
            <span className="shrink-0 rounded-sm bg-amber-100 px-1 font-sans text-[10px] font-semibold normal-case text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
              En {p.sucursal_ajena}
            </span>
          )}
        </p>
        <p className="line-clamp-2 text-sm leading-tight font-semibold">{p.name}</p>
        <p className="truncate text-xs text-muted-foreground capitalize">{p.category || p.inventory_name}</p>
        <div className="mt-auto flex items-center justify-between gap-1 pt-1">
          {importe ? (
            <span className={cn("text-base font-semibold tabular-nums", alCosto && "text-amber-700 dark:text-amber-400")}>
              {alCosto && <span className="mr-1 text-[10px] font-medium uppercase">costo</span>}
              {formatMXN(importe).replace(".00", "")}
            </span>
          ) : (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              Sin precio
            </span>
          )}
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
              p.quantity <= 3 && !soldOut
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                : "bg-muted text-muted-foreground",
            )}
          >
            {soldOut ? "—" : `${p.quantity} disp.`}
          </span>
        </div>
      </div>
    </div>
  );
}

// Compact row — the AI "compatible models" fallback list.
function ProductRow({ p, inCart, onAdd }: { p: SalesProduct; inCart: number; onAdd: () => void }) {
  const off = p.quantity === 0 || inCart >= p.quantity;
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={off}
      className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border bg-background p-2.5 text-left hover:bg-muted/40 disabled:cursor-default disabled:opacity-60"
    >
      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
        <Thumb src={p.image_url} alt={p.name} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{p.name}</span>
        <span className="block truncate font-mono text-xs text-muted-foreground uppercase">{p.sku}</span>
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums">{p.price_cents ? formatMXN(p.price_cents) : "Sin precio"}</span>
      <Plus className="h-4 w-4 shrink-0" />
    </button>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 text-sm whitespace-nowrap capitalize",
        active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

export function SalesScreen({
  products,
  categorias,
  customers,
  verCostos,
  precioBase,
  fiadoExigeCliente,
  clickAbreDetalle,
  comprobanteObligatorio = false,
  inventariosAjenos: inventariosAjenosProp = {},
  esAdmin = false,
  puedeCotizar = false,
  garantia = null,
}: {
  /** First page of the catalog, rendered before any search runs. */
  products: SalesProduct[];
  categorias: CategoriaConteo[];
  customers: PosCustomer[];
  verCostos: boolean;
  precioBase: PrecioBase;
  /** Ruli demands a registered debtor; Fiable lets a walk-in owe with a note. */
  fiadoExigeCliente: boolean;
  clickAbreDetalle: boolean;
  comprobanteObligatorio?: boolean;
  /** inventory_id -> sucursal where that stock sits: visible, not sellable here. */
  inventariosAjenos?: Record<string, string>;
  /** Manual discount is the admin's call; the RPC enforces it too. */
  esAdmin?: boolean;
  puedeCotizar?: boolean;
  /** Warranty terms printed on every ticket (Configuración → Tienda). */
  garantia?: string | null;
}) {
  const router = useRouter();
  const [confirmar, confirmDialog] = useConfirm();
  const mostrador = useMemo(() => customers.find((c) => c.is_system) ?? customers[0], [customers]);
  const [query, setQuery] = useQueryState("q", parseAsString.withDefault("").withOptions({ history: "replace" }));
  const [categoria, setCategoria] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<"venta" | "prestamo">("venta");
  const [customer, setCustomer] = useState<PosCustomer>(mostrador);
  const [note, setNote] = useState("");
  const [descManual, setDescManual] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState(false);
  const [detalle, setDetalle] = useState<SalesProduct | null>(null);
  const [saldo, setSaldo] = useState(0);
  const [catsAbiertas, setCatsAbiertas] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [apartarOpen, setApartarOpen] = useState(false);
  const [carritoOpen, setCarritoOpen] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  const [recibo, setRecibo] = useState<{ ticket: TicketData; usoSaldo: number; saldoRestante: number } | null>(null);
  const [ultima, setUltima] = useState<Ultima | null>(null);
  const [restaurado, setRestaurado] = useState(false);
  const [pending, startTransition] = useTransition();
  const [cotizando, startCotizar] = useTransition();
  const buscador = useRef<HTMLInputElement>(null);

  const chips = useMemo(() => {
    const orden = [...categorias].sort((a, b) => b.productos - a.productos || a.categoria.localeCompare(b.categoria, "es"));
    const top = orden.slice(0, CHIPS);
    if (categoria && !top.some((c) => c.categoria === categoria)) {
      const elegida = orden.find((c) => c.categoria === categoria);
      if (elegida) return [elegida, ...top.slice(0, CHIPS - 1)];
    }
    return top;
  }, [categorias, categoria]);

  // LIVE branch-block map: the counter laptop keeps this page open for days,
  // and yesterday's map was refusing today's counter.
  const [inventariosAjenos, setInventariosAjenos] = useState(inventariosAjenosProp);
  useEffect(() => {
    let on = true;
    const refrescar = () => misInventariosAjenos().then((m) => on && setInventariosAjenos(m)).catch(() => undefined);
    refrescar();
    const onFocus = () => document.visibilityState === "visible" && refrescar();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      on = false;
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const marcarAjenos = useCallback(
    (ps: SalesProduct[]) => ps.map((p) => ({ ...p, sucursal_ajena: inventariosAjenos[p.inventory_id ?? ""] ?? null })),
    [inventariosAjenos],
  );
  const [results, setResults] = useState<SalesProduct[]>(() => marcarAjenos(products));
  const [buscando, setBuscando] = useState(false);

  // Every product the register has shown this session: the cart holds ids and
  // results are only a page of the catalog.
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

  // ---- Restore the open sale (once), re-reading stock and price fresh.
  useEffect(() => {
    const g = leer<Guardado>(LS_VENTA);
    setUltima(leer<Ultima>(LS_ULTIMA));
    if (!g || !Object.keys(g.cart ?? {}).length) {
      setRestaurado(true);
      return;
    }
    productosPorId(Object.keys(g.cart))
      .then((ps) => {
        recordar(ps as SalesProduct[]);
        const stock = new Map(ps.map((p) => [p.id, p.quantity]));
        const limpio: Record<string, number> = {};
        for (const [id, q] of Object.entries(g.cart)) {
          const n = Math.min(q, stock.get(id) ?? 0);
          if (n > 0) limpio[id] = n;
        }
        setCart(limpio);
        setMode(g.mode ?? "venta");
        setNote(g.note ?? "");
        if (esAdmin) setDescManual(g.descManual ?? null);
        const c = customers.find((x) => x.id === g.customerId);
        if (c) setCustomer(c);
        if (Object.keys(limpio).length) toast("Se recuperó la venta que estaba en curso");
      })
      .catch(() => undefined)
      .finally(() => setRestaurado(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restaurado) return;
    const vacia = !Object.keys(cart).length;
    escribir(LS_VENTA, vacia ? null : ({ cart, customerId: customer.id, mode, note, descManual } satisfies Guardado));
  }, [restaurado, cart, customer.id, mode, note, descManual]);

  // ---- Search runs in the database, debounced.
  useEffect(() => {
    let cancelado = false;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const rows = (await buscarProductos({ query, categoria, limit: GRID_LIMIT })) as SalesProduct[];
        if (cancelado) return;
        setResults(marcarAjenos(rows));
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
    // A router.refresh() after a sale hands down a new `products`: the cue to
    // re-read stock on the cards.
  }, [query, categoria, recordar, products, marcarAjenos]);

  const buscarCompat = useCallback(
    async (modelo: string) => {
      const rows = (await buscarProductos({ query: modelo, limit: 4 })) as SalesProduct[];
      recordar(rows);
      return rows;
    },
    [recordar],
  );

  // ---- The sale's numbers.
  const pctCliente = customer.is_system ? 0 : Number(customer.descuento_pct) || 0;
  const pct = descManual ?? pctCliente;
  const origen: "manual" | "cliente" | null = descManual != null ? (descManual > 0 ? "manual" : null) : pctCliente > 0 ? "cliente" : null;
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ product: conocidos[id], qty }))
    .filter((l) => l.product);
  const subtotal = lines.reduce((s, l) => s + l.product.price_cents * l.qty, 0);
  const total = lines.reduce((s, l) => s + conDescuento(l.product.price_cents, pct) * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const etiquetaDesc = origen === "manual" ? `Descuento especial · ${pct}%` : `Descuento del cliente · ${pct}%`;

  function add(p: SalesProduct) {
    const ajena = inventariosAjenos[p.inventory_id ?? ""];
    if (ajena) {
      toast.error(`${p.name} está en la sucursal ${ajena}. Ofrécelo y mándalo traer — se cobra desde allá.`);
      return false;
    }
    if (!p.price_cents) {
      toast.error(`${p.name} no tiene precio. Asígnalo en Inventario.`);
      return false;
    }
    if ((cart[p.id] ?? 0) >= p.quantity) {
      toast.error(p.quantity ? `Solo hay ${p.quantity} de ${p.name}` : `${p.name} está agotado`);
      return false;
    }
    recordar([p]);
    setCart((c) => ({ ...c, [p.id]: Math.min((c[p.id] ?? 0) + 1, p.quantity) }));
    return true;
  }
  function setQty(id: string, qty: number) {
    setCart((c) => {
      const next = Math.max(0, Math.min(qty, conocidos[id]?.quantity ?? 0));
      if (next === 0) {
        const { [id]: _omit, ...rest } = c;
        return rest;
      }
      return { ...c, [id]: next };
    });
  }

  function limpiar() {
    setCart({});
    setCustomer(mostrador);
    setNote("");
    setDescManual(null);
    setEditDesc(false);
    setMode("venta");
  }
  async function pedirLimpiar() {
    if (!lines.length) return;
    const ok = await confirmar({ title: "¿Vaciar la venta?", description: `Se quitan ${count} piezas del carrito.`, confirmLabel: "Vaciar", tone: "danger" });
    if (ok) {
      limpiar();
      setCarritoOpen(false);
    }
  }

  // Enter in the search (or a USB scanner, which types the code + Enter): a
  // label link adds that product; anything else adds the exact SKU, or the top
  // hit. Looked up fresh — a scanner is faster than the debounce.
  async function agregarDeTexto(texto: string) {
    const t = texto.trim();
    if (!t) return;
    const id = idDeCodigo(t);
    let p: SalesProduct | undefined;
    if (id) {
      p = ((await productosPorId([id])) as SalesProduct[])[0];
      if (!p) return void toast.error("Esa etiqueta no es de un producto de esta tienda");
    } else {
      const rows = (await buscarProductos({ query: t, limit: 5 })) as SalesProduct[];
      p = rows.find((r) => r.sku.toLowerCase() === t.toLowerCase()) ?? rows.find((r) => r.quantity > 0) ?? rows[0];
      if (!p) return void toast.error(`Nada coincide con “${t}”`);
    }
    if (add(p)) {
      toast.success(`Agregado · ${p.name}`, { duration: 1500 });
      setQuery("");
    }
  }

  // The camera scanner keeps reading until closed; the same label twice within
  // two seconds is one read, not two pieces.
  const ultimoEscaneo = useRef<{ texto: string; t: number } | null>(null);
  const [escKey, setEscKey] = useState(0);
  // Stable: the scanner restarts its camera whenever this identity changes.
  const cerrarEscaner = useCallback(() => setEscaneando(false), []);
  async function alEscanear(texto: string) {
    const ahora = Date.now();
    const u = ultimoEscaneo.current;
    ultimoEscaneo.current = { texto, t: ahora };
    if (!(u && u.texto === texto && ahora - u.t < 2000)) await agregarDeTexto(texto);
    setTimeout(() => setEscKey((k) => k + 1), 900);
  }

  // Credit rules — the database is the actual guard; this says why the
  // button is grey before anyone presses it.
  const aMostrador = mode === "prestamo" && customer.is_system;
  const faltaCliente = aMostrador && fiadoExigeCliente;
  const faltaNota = aMostrador && !fiadoExigeCliente && note.trim().length < 5;
  const canSubmit = lines.length > 0 && !faltaCliente && !faltaNota && !pending;

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

  function submit(metodo?: PaymentMethodVenta, pagos?: PagoSplit[], comprobante?: Comprobante) {
    if (!canSubmit) return;
    const items = lines.map((l) => ({ product_id: l.product.id, qty: l.qty }));
    const esFiado = mode === "prestamo";
    const pm: PaymentMethodVenta = metodo ?? "efectivo";
    const manual = esAdmin && descManual != null ? descManual : null;
    // Snapshot now — the cart is cleared before anyone taps "Imprimir".
    const ticketBase = {
      items: lines.map((l) => {
        const u = conDescuento(l.product.price_cents, pct);
        return { nombre: l.product.name, qty: l.qty, precioUnit: u, total: u * l.qty };
      }),
      total,
      metodoPago: esFiado ? null : pm,
      // Always named, Mostrador included: the ticket is the customer's copy
      // and it should say who it was made out to.
      cliente: customer.nombre,
      tipo: (esFiado ? "fiado" : "venta") as TicketData["tipo"],
      descuento: origen ? { subtotal, etiqueta: etiquetaDesc } : null,
      garantia,
    };

    startTransition(async () => {
      try {
        const { saleId } = esFiado
          ? await registerLoan(items, customer.is_system ? null : customer.id, note, manual)
          : await registerSale(items, pm, customer.id, pagos, manual);

        // Transfer proof rides AFTER the sale: its failure downgrades a toast,
        // never the charge.
        if (comprobante && !esFiado) {
          let form: FormData | undefined;
          if (comprobante.foto) {
            form = new FormData();
            form.append("file", comprobante.foto);
          }
          const rc = await guardarComprobante(saleId, comprobante.referencia, form, comprobante.cuentaId);
          if (!rc.ok) toast.error(`Venta ok, pero el comprobante no se guardó: ${rc.error}`);
        }
        const ticket: TicketData = { folio: saleId, fecha: new Date().toISOString(), ...ticketBase };
        const usoSaldo = (pagos ?? []).find((p) => p.metodo === "saldo")?.monto_cents ?? 0;
        setRecibo({ ticket, usoSaldo, saldoRestante: Math.max(0, saldo - usoSaldo) });
        setUltima({ ticket });
        escribir(LS_ULTIMA, { ticket });
        limpiar();
        setQuery("");
        setPaymentOpen(false);
        setCarritoOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Error al registrar");
      }
    });
  }

  function onCta() {
    if (!canSubmit) return;
    if (mode === "prestamo") submit();
    else setPaymentOpen(true);
  }

  function cotizar() {
    if (!lines.length) return;
    startCotizar(async () => {
      const r = await crearCotizacion(
        lines.map((l) => ({ product_id: l.product.id, qty: l.qty })),
        customer.is_system ? null : customer.id,
        null,
        "",
        "mostrador",
        "borrador",
      );
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Cotización ${r.data.folio} creada`);
      limpiar();
      router.push(`/cotizaciones/${r.data.id}`);
    });
  }

  // ---- Keyboard: F2 charges, F4 switches to credit, Esc clears. Any other
  // key typed with focus nowhere lands in the search (a USB scanner too).
  const hayOverlay = paymentOpen || apartarOpen || carritoOpen || escaneando || !!detalle || !!recibo || catsAbiertas;
  const teclado = useRef({ onCta, pedirLimpiar, hayOverlay, query });
  teclado.current = { onCta, pedirLimpiar, hayOverlay, query };
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const k = teclado.current;
      if (k.hayOverlay) return;
      if (e.key === "F2") {
        e.preventDefault();
        k.onCta();
      } else if (e.key === "F4") {
        e.preventDefault();
        setMode((m) => (m === "venta" ? "prestamo" : "venta"));
      } else if (e.key === "Escape") {
        if (k.query) setQuery("");
        else k.pedirLimpiar();
      } else {
        const t = e.target as HTMLElement | null;
        const enCampo = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
        if (!enCampo && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) buscador.current?.focus();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [setQuery]);

  const hora = (iso: string) => new Date(iso).toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
  const resumenCobro = `${count} ${count === 1 ? "pieza" : "piezas"}${customer.is_system ? "" : ` · ${customer.nombre}`}`;

  // ---- The order panel: the right column on a counter, a sheet on a phone.
  const orden = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="text-[15px] font-semibold">Venta en curso</h2>
        {count > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
            {count} {count === 1 ? "pieza" : "piezas"}
          </span>
        )}
        <div className="ml-auto inline-flex rounded-lg bg-muted p-0.5 text-sm">
          {(["venta", "prestamo"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "h-8 cursor-pointer rounded-md px-3 font-medium",
                mode === m ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "venta" ? "Venta" : "Crédito"}
            </button>
          ))}
        </div>
      </div>

      <div data-base-ui-swipe-ignore className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-sm text-muted-foreground">
            <ShoppingCart className="h-8 w-8 text-muted-foreground/40" />
            Toca un producto, escanea su etiqueta o escribe y presiona Enter.
          </div>
        ) : (
          <ul className="divide-y divide-border px-4">
            {lines.map((l) => {
              const u = conDescuento(l.product.price_cents, pct);
              return (
                <li key={l.product.id} className="flex items-center gap-2.5 py-2.5">
                  <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border">
                    <Thumb src={l.product.image_url} alt={l.product.name} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{l.product.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {formatMXN(l.product.price_cents).replace(".00", "")} c/u
                      {l.product.inventory_name && ` · ${l.product.inventory_name}`}
                    </p>
                  </div>
                  <div className="flex h-9 items-center overflow-hidden rounded-lg border border-border">
                    <button
                      type="button"
                      aria-label="Una menos"
                      onClick={() => setQty(l.product.id, l.qty - 1)}
                      className="flex h-full w-8 cursor-pointer items-center justify-center text-muted-foreground hover:bg-muted"
                    >
                      {l.qty === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                    </button>
                    <span className="w-7 text-center text-sm font-semibold tabular-nums">{l.qty}</span>
                    <button
                      type="button"
                      aria-label="Una más"
                      disabled={l.qty >= l.product.quantity}
                      onClick={() => setQty(l.product.id, l.qty + 1)}
                      className="flex h-full w-8 cursor-pointer items-center justify-center text-muted-foreground hover:bg-muted disabled:cursor-default disabled:opacity-30"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="w-20 text-right text-sm font-semibold tabular-nums">{formatMXN(u * l.qty)}</span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="space-y-2.5 px-4 pt-1 pb-3">
          <CustomerPicker customers={customers} value={customer} onChange={(c) => setCustomer(c as PosCustomer)} />
          {!customer.is_system && <ResumenClienteChip customerId={customer.id} />}
          {mode === "prestamo" && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Se registra como nota de crédito</p>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={aMostrador ? "¿Quién debe? Nombre, teléfono o seña" : "¿Qué se acordó? Plazo, referencia…"}
                className="h-10 bg-background text-base sm:text-sm"
              />
              {faltaCliente && <p className="text-xs text-amber-800 dark:text-amber-300">Un crédito necesita cliente registrado. Elige o crea uno arriba.</p>}
              {aMostrador && !fiadoExigeCliente && (
                <p className="text-xs text-amber-800 dark:text-amber-300">Sin cliente registrado, la nota es lo único que dirá quién debe.</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-1.5 border-t border-border bg-muted/30 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pb-3">
        {(origen || esAdmin) && lines.length > 0 && (
          <>
            <div className="flex justify-between text-[13px]">
              <span className="text-muted-foreground">Piezas</span>
              <span className="tabular-nums">{formatMXN(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[13px]">
              {esAdmin ? (
                <button
                  type="button"
                  onClick={() => setEditDesc((v) => !v)}
                  className="inline-flex cursor-pointer items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  <Tag className="h-3.5 w-3.5" />
                  {origen ? etiquetaDesc : "Agregar descuento"}
                </button>
              ) : (
                <span className="text-muted-foreground">{etiquetaDesc}</span>
              )}
              {origen && <span className="text-red-700 tabular-nums dark:text-red-400">−{formatMXN(subtotal - total)}</span>}
            </div>
            {esAdmin && editDesc && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {pctCliente > 0 && (
                  <Chip active={descManual == null} onClick={() => setDescManual(null)}>
                    Cliente {pctCliente}%
                  </Chip>
                )}
                <Chip active={descManual === 0 || (descManual == null && pctCliente === 0)} onClick={() => setDescManual(pctCliente > 0 ? 0 : null)}>
                  Sin
                </Chip>
                {DESCUENTOS.map((d) => (
                  <Chip key={d} active={descManual === d} onClick={() => setDescManual(d)}>
                    {d}%
                  </Chip>
                ))}
                <input
                  inputMode="decimal"
                  aria-label="Otro porcentaje"
                  placeholder="Otro %"
                  className="h-9 w-20 rounded-full border border-border bg-background px-3 text-sm outline-hidden"
                  onChange={(e) => {
                    const v = Number(e.target.value.replace(",", "."));
                    if (v > 0 && v <= 100) setDescManual(Math.round(v * 100) / 100);
                  }}
                />
              </div>
            )}
          </>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-semibold">Total</span>
          <span className="text-[26px] font-bold tracking-tight tabular-nums">
            <NumberFlow value={total / 100} locales="es-MX" format={{ style: "currency", currency: "MXN" }} />
          </span>
        </div>
        <Button
          variant={mode === "prestamo" ? "brand" : "primary"}
          className="mt-1 h-13 w-full rounded-xl text-base"
          onClick={onCta}
          loading={pending}
          disabled={!canSubmit}
        >
          {mode === "prestamo" ? (
            "Registrar crédito"
          ) : (
            <>
              <Banknote className="h-5 w-5" /> Cobrar {formatMXN(total)}
            </>
          )}
        </Button>
        <div className="flex gap-2 pt-0.5">
          {puedeCotizar && (
            <Button variant="secondary" className="h-10 flex-1" onClick={cotizar} loading={cotizando} disabled={!lines.length}>
              <FileText className="h-4 w-4" /> Cotizar
            </Button>
          )}
          <Button variant="secondary" className="h-10 flex-1" onClick={() => setApartarOpen(true)} disabled={!lines.length || mode === "prestamo"}>
            <Wallet className="h-4 w-4" /> Apartar
          </Button>
          <Button variant="secondary" className="h-10 w-11 px-0" aria-label="Vaciar venta" onClick={pedirLimpiar} disabled={!lines.length}>
            <Trash2 className="h-4 w-4 text-red-700 dark:text-red-400" />
          </Button>
        </div>
        <p className="hidden pt-0.5 text-center text-[11px] text-muted-foreground lg:block">F2 cobra · F4 crédito · Esc limpia</p>
      </div>
    </div>
  );

  return (
    <section data-ancho="completo" className="pb-28 lg:pb-0">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Punto de venta</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Busca, escanea o toca para agregar. El stock se descuenta solo.</p>
        </div>
        {ultima && (
          <div className="ml-auto hidden items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-1.5 sm:flex">
            <Printer className="h-4 w-4 text-muted-foreground" />
            <div className="leading-tight">
              <p className="text-[10px] text-muted-foreground">Última venta</p>
              <p className="text-[13px] font-semibold tabular-nums">
                {formatMXN(ultima.ticket.total)} · {hora(ultima.ticket.fecha)}
              </p>
            </div>
            <Button variant="secondary" className="h-8 px-2.5 text-xs" onClick={() => imprimirTicketNavegador(ultima.ticket)}>
              Reimprimir
            </Button>
          </div>
        )}
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-5">
        <div>
          <div className="flex gap-2.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={buscador}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    agregarDeTexto(query);
                  }
                }}
                placeholder="Nombre, SKU o modelo"
                enterKeyHint="go"
                className="h-13 w-full rounded-xl border-2 border-foreground bg-background pr-10 pl-11 sm:pr-28 text-base outline-hidden placeholder:text-muted-foreground"
              />
              <span className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-2">
                {buscando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                <span className="hidden rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">Enter agrega</span>
              </span>
            </div>
            <Button variant="brand" className="h-13 w-13 shrink-0 rounded-xl px-0" aria-label="Escanear etiqueta" onClick={() => setEscaneando(true)}>
              <QrCode className="h-6 w-6" />
            </Button>
          </div>

          {categorias.length > 1 && (
            <div className="mt-3 flex items-center gap-2">
              <div className="flex flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Chip active={categoria === null} onClick={() => setCategoria(null)}>
                  Todas
                </Chip>
                {chips.map((c) => (
                  <Chip key={c.categoria} active={categoria === c.categoria} onClick={() => setCategoria(categoria === c.categoria ? null : c.categoria)}>
                    {c.categoria} <span className="tabular-nums opacity-60">{c.productos}</span>
                  </Chip>
                ))}
              </div>
              {categorias.length > CHIPS && (
                <button
                  type="button"
                  onClick={() => setCatsAbiertas(true)}
                  className="h-9 shrink-0 cursor-pointer rounded-full border border-border bg-background px-3 text-sm text-muted-foreground hover:bg-muted"
                >
                  Todas ({categorias.length})
                </button>
              )}
            </div>
          )}

          {results.length === 0 ? (
            <div className="mt-3">
              <p className="px-1 py-6 text-center text-sm text-muted-foreground">{buscando ? "Buscando…" : "Sin resultados."}</p>
              {query.trim() && !buscando && (
                <CompatPanel
                  query={query}
                  buscar={buscarCompat}
                  renderItem={(p) => <ProductRow key={p.id} p={p} inCart={cart[p.id] ?? 0} onAdd={() => add(p)} />}
                />
              )}
            </div>
          ) : (
            <div className={cn("mt-3 grid grid-cols-2 gap-2.5 transition-opacity sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5", buscando && "opacity-60")}>
              {results.map((p) => (
                <ProductCard
                  key={p.id}
                  p={p}
                  inCart={cart[p.id] ?? 0}
                  onAdd={() => add(p)}
                  onVerDetalle={() => setDetalle(p)}
                  clickAbreDetalle={clickAbreDetalle}
                  precioBase={precioBase}
                />
              ))}
            </div>
          )}
        </div>

        {/* overflow-visible: the customer picker's dropdown opens upward and
            a clip would eat its search box. */}
        <aside className="hidden max-h-[calc(100dvh-2rem)] flex-col rounded-2xl border border-border bg-background shadow-xs lg:sticky lg:top-4 lg:flex">
          {orden}
        </aside>
      </div>

      <BarraInferior>
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={() => setCarritoOpen(true)} className="min-w-0 cursor-pointer text-left leading-tight">
            <p className="truncate text-[11px] text-muted-foreground">
              {count} {count === 1 ? "pieza" : "piezas"}
              {origen ? ` · con ${pct}% desc.` : ""}
              {mode === "prestamo" ? " · crédito" : ""}
            </p>
            <p className="text-[22px] font-bold tabular-nums">
              <NumberFlow value={total / 100} locales="es-MX" format={{ style: "currency", currency: "MXN" }} />
            </p>
          </button>
          <div className="flex-1" />
          <Button
            variant="secondary"
            className="relative h-13 w-13 rounded-2xl px-0"
            aria-label="Ver carrito"
            onClick={() => setCarritoOpen(true)}
          >
            <ShoppingCart className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[11px] font-semibold text-background tabular-nums">
                {count}
              </span>
            )}
          </Button>
          <Button
            variant={mode === "prestamo" ? "brand" : "primary"}
            className="h-13 rounded-2xl px-6 text-base"
            onClick={() => (lines.length ? onCta() : setCarritoOpen(true))}
            loading={pending}
            disabled={!lines.length}
          >
            {mode === "prestamo" ? "Crédito" : "Cobrar"}
          </Button>
        </div>
      </BarraInferior>

      <Drawer open={carritoOpen} onOpenChange={setCarritoOpen} showSwipeHandle>
        <DrawerContent className="top-24 max-h-none">
          <DrawerTitle className="sr-only">Venta en curso</DrawerTitle>
          {orden}
        </DrawerContent>
      </Drawer>

      <PaymentSheet
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        total={total}
        resumen={resumenCobro}
        pending={pending}
        comprobanteObligatorio={comprobanteObligatorio}
        saldoDisponible={saldo}
        onConfirm={(metodo, pagos, comprobante) => submit(metodo, pagos, comprobante)}
      />

      <ApartarPanel
        open={apartarOpen}
        lineas={lines.map((l) => ({
          productId: l.product.id,
          nombre: l.product.name,
          qty: l.qty,
          unit: conDescuento(l.product.price_cents, pct),
        }))}
        clienteInicial={customer.is_system ? "" : `${customer.nombre}${customer.telefono ? ` · ${customer.telefono}` : ""}`}
        onClose={() => setApartarOpen(false)}
        onListo={() => {
          setApartarOpen(false);
          setCarritoOpen(false);
          limpiar();
        }}
      />

      {escaneando && (
        <EscanerQR
          key={escKey}
          onClose={cerrarEscaner}
          onCodigo={(texto) => {
            alEscanear(texto);
          }}
        />
      )}

      {recibo && (
        <ReciboImpreso ticket={recibo.ticket} usoSaldo={recibo.usoSaldo} saldoRestante={recibo.saldoRestante} onClose={() => setRecibo(null)} />
      )}

      {catsAbiertas && (
        <CategoriaSheet categorias={categorias} activa={categoria} onPick={setCategoria} onClose={() => setCatsAbiertas(false)} />
      )}

      <ProductoSheet
        p={detalle}
        verCostos={verCostos}
        onClose={() => setDetalle(null)}
        onAgregar={(p) => {
          add(p);
        }}
      />

      {confirmDialog}
    </section>
  );
}
