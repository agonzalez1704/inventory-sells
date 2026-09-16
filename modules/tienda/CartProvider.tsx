"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// Cart lives in localStorage so a reload (or a WhatsApp detour) doesn't lose it.
// Prices/stock here are only for DISPLAY — the order RPC re-reads both from the
// catalog, so a stale cart can never set the price we charge.
const KEY = "ld_cart_v1";

export type CartItem = {
  id: string;
  nombre: string;
  precio_cents: number;
  imagen: string | null;
  qty: number;
  max: number; // stock snapshot, to keep the stepper sane
};

/**
 * How the order will be received. Chosen in the cart, finished in checkout —
 * so it lives with the cart and survives a reload the same way.
 */
export type Entrega = {
  tipo: "envio" | "recoger";
  /** Pickup only: "yo" holds without paying; "uber" means someone else
   *  collects with just the folio, so it must be paid online. */
  quien: "yo" | "uber";
  /** Branch name; null = not chosen yet (the first one is assumed). */
  sucursal: string | null;
};

const KEY_ENTREGA = "ld_entrega_v1";

// Most customers are local and come in person: the approved design opens on
// pickup, held without paying.
export const ENTREGA_INICIAL: Entrega = { tipo: "recoger", quien: "yo", sucursal: null };

type CartCtx = {
  entrega: Entrega;
  setEntrega: (e: Entrega) => void;
  items: CartItem[];
  count: number;
  subtotal: number;
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  setQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  ready: boolean;
};

const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [entrega, setEntrega] = useState<Entrega>(ENTREGA_INICIAL);
  // Avoid rendering a "0" badge during hydration before localStorage is read.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CartItem[];
        if (Array.isArray(parsed)) setItems(parsed.filter((i) => i?.id && i.qty > 0));
      }
    } catch {
      // corrupt payload — start clean rather than crash the storefront
    }
    try {
      const e = JSON.parse(localStorage.getItem(KEY_ENTREGA) ?? "null") as Partial<Entrega> | null;
      if (e && (e.tipo === "envio" || e.tipo === "recoger") && (e.quien === "yo" || e.quien === "uber")) {
        setEntrega({ tipo: e.tipo, quien: e.quien, sucursal: typeof e.sucursal === "string" ? e.sucursal : null });
      }
    } catch {
      // same: a bad stored choice just falls back to the default
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(items));
    } catch {
      // quota/private mode — the cart just won't persist
    }
  }, [items, ready]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(KEY_ENTREGA, JSON.stringify(entrega));
    } catch {
      // quota/private mode — the choice just won't persist
    }
  }, [entrega, ready]);

  const add = useCallback((item: Omit<CartItem, "qty">, qty = 1) => {
    setItems((cur) => {
      const found = cur.find((i) => i.id === item.id);
      if (found) {
        const next = Math.min(found.qty + qty, item.max);
        return cur.map((i) => (i.id === item.id ? { ...i, ...item, qty: next } : i));
      }
      return [...cur, { ...item, qty: Math.min(qty, item.max) }];
    });
    setOpen(true);
  }, []);

  const setQty = useCallback((id: string, qty: number) => {
    setItems((cur) =>
      cur
        .map((i) => (i.id === id ? { ...i, qty: Math.max(0, Math.min(qty, i.max)) } : i))
        .filter((i) => i.qty > 0),
    );
  }, []);

  const remove = useCallback(
    (id: string) => setItems((cur) => cur.filter((i) => i.id !== id)),
    [],
  );
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartCtx>(() => {
    const count = items.reduce((s, i) => s + i.qty, 0);
    const subtotal = items.reduce((s, i) => s + i.precio_cents * i.qty, 0);
    return { entrega, setEntrega, items, count, subtotal, add, setQty, remove, clear, open, setOpen, ready };
  }, [entrega, items, add, setQty, remove, clear, open, ready]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart fuera de CartProvider");
  return c;
}
