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
  /** The supplier ships this line straight to the customer. */
  es_dropship: boolean;
};

export type Resumen = {
  lineas: LineaValidada[];
  subtotal_cents: number;
  /** Dropped because they went out of stock / inactive while browsing. */
  removidos: string[];
  /** The PHYSICAL shipment's extra business days: the slowest warehouse wins. */
  demora_dias: number;
  /** Pieces that ship from us — what the Skydropx parcel actually weighs. */
  piezas_fisicas: number;
  /** Slowest dropship line's business days. 0 = no dropship lines. */
  demora_dropship: number;
};

type Row = {
  id: string;
  name: string;
  price_cents: number;
  quantity: number;
  image_url: string | null;
  is_active: boolean;
  inventories: { entrega_dias_habiles: number | null; es_dropship: boolean | null } | null;
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
      .select("id, name, price_cents, quantity, image_url, is_active, inventories(entrega_dias_habiles, es_dropship)")
      .in("id", ids);
    const rows = (data ?? []) as unknown as Row[];
    const byId = new Map(rows.map((r) => [r.id, r]));

    const out: LineaValidada[] = [];
    const removidos: string[] = [];
    for (const l of lineas) {
      const p = byId.get(l.id);
      const qty = Math.max(1, Math.floor(l.qty));
      const dropship = p?.inventories?.es_dropship ?? false;
      // Must be active and priced; stock only gates lines WE hold — a dropship
      // line's stock is the supplier's problem, not a reason to drop it.
      if (!p || !p.is_active || p.price_cents <= 0 || (!dropship && p.quantity <= 0)) {
        if (p) removidos.push(p.name);
        continue;
      }
      out.push({
        id: p.id,
        nombre: p.name,
        precio_cents: p.price_cents,
        imagen: p.image_url,
        // Silently cap at what's really available — never reveal the number.
        qty: dropship ? qty : Math.min(qty, p.quantity),
        entrega_dias: p.inventories?.entrega_dias_habiles ?? 0,
        es_dropship: dropship,
      });
    }
    if (out.length === 0)
      throw new Error("Los productos de tu carrito ya no están disponibles");

    const fisicas = out.filter((l) => !l.es_dropship);
    const drop = out.filter((l) => l.es_dropship);
    return {
      lineas: out,
      subtotal_cents: out.reduce((s, l) => s + l.precio_cents * l.qty, 0),
      removidos,
      // Two shipments, two promises. The physical parcel is paced by its
      // slowest warehouse; the dropship block travels on its own from the
      // supplier and must never drag the local parcel's date with it.
      demora_dias: Math.max(0, ...fisicas.map((l) => l.entrega_dias)),
      piezas_fisicas: fisicas.reduce((s, l) => s + l.qty, 0),
      demora_dropship: Math.max(0, ...drop.map((l) => l.entrega_dias)),
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
