"use server";

import { insforgeAdmin } from "@/lib/insforge/admin";
import { cotizarEnvio, paqueteParaPiezas, type Tarifa } from "@/lib/skydropx";
import { buscarCP, type LugarCP } from "@/lib/cp-mexico";
import { attempt, type ActionResult } from "@/lib/errors";

// Public checkout. Everything the browser sends is untrusted: prices and
// availability are re-read from the catalog here, and again (under a row lock)
// inside crear_orden_web.

export type CartLinea = { id: string; qty: number };

export type LineaValidada = {
  id: string;
  nombre: string;
  precio_cents: number;
  imagen: string | null;
  qty: number;
  /** Extra business days because this line's stock sits in another city. */
  entrega_dias: number;
};

export type Resumen = {
  lineas: LineaValidada[];
  subtotal_cents: number;
  /** Dropped because they went out of stock / inactive while browsing. */
  removidos: string[];
  /** The whole order's extra business days: the slowest warehouse wins. */
  demora_dias: number;
};

type Row = {
  id: string;
  name: string;
  price_cents: number;
  quantity: number;
  image_url: string | null;
  is_active: boolean;
  inventories: { entrega_dias_habiles: number | null } | null;
};

// Re-price the cart from the catalog. Never trust client prices.
export async function validarCarrito(
  lineas: CartLinea[],
): Promise<ActionResult<Resumen>> {
  return attempt("validarCarrito", async () => {
    const ids = [...new Set(lineas.map((l) => l.id))].filter(Boolean);
    if (ids.length === 0) throw new Error("Tu carrito está vacío");

    const { data } = await insforgeAdmin.database
      .from("products")
      .select("id, name, price_cents, quantity, image_url, is_active, inventories(entrega_dias_habiles)")
      .in("id", ids);
    const rows = (data ?? []) as unknown as Row[];
    const byId = new Map(rows.map((r) => [r.id, r]));

    const out: LineaValidada[] = [];
    const removidos: string[] = [];
    for (const l of lineas) {
      const p = byId.get(l.id);
      const qty = Math.max(1, Math.floor(l.qty));
      // Must be active, priced and in stock, or it can't be sold online.
      if (!p || !p.is_active || p.price_cents <= 0 || p.quantity <= 0) {
        if (p) removidos.push(p.name);
        continue;
      }
      out.push({
        id: p.id,
        nombre: p.name,
        precio_cents: p.price_cents,
        imagen: p.image_url,
        // Silently cap at what's really available — never reveal the number.
        qty: Math.min(qty, p.quantity),
        entrega_dias: p.inventories?.entrega_dias_habiles ?? 0,
      });
    }
    if (out.length === 0)
      throw new Error("Los productos de tu carrito ya no están disponibles");

    return {
      lineas: out,
      subtotal_cents: out.reduce((s, l) => s + l.precio_cents * l.qty, 0),
      removidos,
      // One shipment, one promise: the slowest warehouse in the cart sets the
      // extra days for the whole order. 2 screens from the shop plus 5 flexes
      // from Irapuato is an Irapuato-paced order — saying otherwise at
      // checkout would be a promise the parcel cannot keep.
      demora_dias: Math.max(0, ...out.map((l) => l.entrega_dias)),
    };
  });
}

export type OpcionEnvio = Tarifa;

export async function cotizarParaCP(
  cp: string,
  estado: string,
  municipio: string,
  piezas: number,
): Promise<ActionResult<OpcionEnvio[]>> {
  return attempt("cotizarParaCP", async () => {
    if (!/^\d{5}$/.test(cp)) throw new Error("Código postal inválido (5 dígitos)");
    if (!estado.trim() || !municipio.trim())
      throw new Error("Falta estado o municipio");

    const rates = await cotizarEnvio(
      { cp, estado: estado.trim(), municipio: municipio.trim() },
      paqueteParaPiezas(piezas),
    );
    if (rates.length === 0)
      throw new Error(
        "No encontramos paqueterías para ese código postal. Escríbenos por WhatsApp.",
      );
    // Only the cheapest few — a 13-option list is a decision, not a service.
    return rates.slice(0, 4);
  });
}


/**
 * What a postal code implies, so the customer does not retype it.
 *
 * Public on purpose — the storefront has no session, and a postal code is not
 * anybody's secret.
 */
export async function lugarDeCP(cp: string): Promise<LugarCP | null> {
  return buscarCP(cp);
}
