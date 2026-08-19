/**
 * What each quality tier means, in one line.
 *
 * The catalogue speaks in trade shorthand — INCELL, OLED, ORG — and the same
 * repair runs from $280 to $2,080. Without a gloss that 7.4x looks arbitrary;
 * with one it becomes a reason to move up a tier.
 *
 * Deliberately generic. These are commercial claims about parts this shop sells
 * and warrants, so they say what the tier IS, never what it will do — no
 * lifetimes, no feature promises. "Muy parecida a la original" is only on OLED,
 * where it holds; on the entry tiers it would be false.
 */
export const GLOSA: Record<string, string> = {
  Original: "Pieza del fabricante.",
  OLED: "Calidad muy parecida a la original.",
  Incell: "Alternativa económica.",
  AAA: "Opción de entrada.",
};

export function glosaDe(calidad: string | null | undefined): string | null {
  return calidad ? GLOSA[calidad] ?? null : null;
}

export type VarianteModelo = {
  id: string;
  nombre: string;
  calidad: string | null;
  precio_cents: number;
  disponible: boolean;
  /** Last one on the shelf. A flag, never the count — the storefront publishes
   *  no inventory numbers. */
  ultima: boolean;
  imagen: string | null;
};

export type ModeloTienda = {
  modelo: string;
  brand: string | null;
  category: string | null;
  imagen: string | null;
  desde_cents: number | null;
  variantes: VarianteModelo[];
  /** Null when the model has no sales history — an unearned badge is a claim. */
  mas_vendida: string | null;
};

/**
 * Group already-fetched products by model.
 *
 * Only the search path needs this: browsing groups in SQL. Both read the same
 * `modelo` column, so there is one definition of what a model is — writing the
 * regex again here is exactly the drift the generated column was added to stop.
 */
export function agruparPorModelo<
  T extends {
    id: string;
    modelo?: string | null;
    name: string;
    brand: string | null;
    category: string | null;
    calidad?: string | null;
    price_cents: number;
    quantity: number;
    image_url: string | null;
  },
>(filas: T[]): ModeloTienda[] {
  const mapa = new Map<string, ModeloTienda>();
  for (const f of filas) {
    const clave = `${f.brand ?? ""}|${f.category ?? ""}|${f.modelo ?? f.name}`;
    let g = mapa.get(clave);
    if (!g) {
      g = {
        modelo: f.modelo ?? f.name,
        brand: f.brand,
        category: f.category,
        imagen: null,
        desde_cents: null,
        variantes: [],
        mas_vendida: null,
      };
      mapa.set(clave, g);
    }
    g.variantes.push({
      id: f.id,
      nombre: f.name,
      calidad: f.calidad ?? null,
      precio_cents: f.price_cents,
      disponible: f.quantity > 0,
      ultima: f.quantity === 1,
      imagen: f.image_url,
    });
    if (!g.imagen && f.image_url) g.imagen = f.image_url;
    if (f.price_cents > 0 && (g.desde_cents === null || f.price_cents < g.desde_cents)) {
      g.desde_cents = f.price_cents;
    }
  }
  for (const g of mapa.values()) {
    g.variantes.sort((a, b) => a.precio_cents - b.precio_cents || a.nombre.localeCompare(b.nombre));
  }
  return [...mapa.values()];
}
