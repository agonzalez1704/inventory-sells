// Pure data and normalisation — no database client, so a client component can
// import the type and the empty value without dragging the server in. The
// reader lives in modules/config/lib.ts with the other config readers.
//
// Customer-facing commitments for the storefront: address, hours, delivery and
// warranty terms, and the address a courier quotes shipping from.
//
// These used to be a hard-coded constant, which meant Ruli's storefront
// promised Fiable's counter in León. They are one business's facts, not brand
// identity, so they live in that business's own database — config_negocio,
// which is where anything that should change without a redeploy already lives.
//
// No free-shipping threshold on purpose: at a 12.7% real margin and a $388
// average ticket (max ever: $1,680), giving away a ~$150 guía costs ~3x the
// margin of a typical order. Shipping is quoted per destination instead.

export type TiendaInfo = {
  entregaDias: string | null;
  garantiaDias: number | null;
  garantiaCondicion: string | null;
  direccion: string | null;
  ciudad: string | null;
  horario: string | null;
  /** Shipping origin. Without it the courier cannot quote. */
  origen: {
    cp: string;
    estado: string;
    municipio: string;
    colonia: string;
  } | null;
};

export const TIENDA_VACIA: TiendaInfo = {
  entregaDias: null,
  garantiaDias: null,
  garantiaCondicion: null,
  direccion: null,
  ciudad: null,
  horario: null,
  origen: null,
};

const texto = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

/**
 * Read and normalise the stored object.
 *
 * Every field is optional and validated on the way out rather than trusted:
 * this is jsonb written by a form, and a half-filled row must render as a
 * half-filled shop, not throw on a customer.
 */
export function normalizarTienda(raw: unknown): TiendaInfo {
  const o = (raw ?? {}) as Record<string, unknown>;
  const org = (o.origen ?? {}) as Record<string, unknown>;
  const cp = texto(org.cp);
  const estado = texto(org.estado);
  const municipio = texto(org.municipio);
  const colonia = texto(org.colonia);
  const dias = Number(o.garantiaDias);
  return {
    entregaDias: texto(o.entregaDias),
    // A warranty of "0 days" is a real answer; only a missing one is null.
    garantiaDias: Number.isFinite(dias) && dias >= 0 ? Math.round(dias) : null,
    garantiaCondicion: texto(o.garantiaCondicion),
    direccion: texto(o.direccion),
    ciudad: texto(o.ciudad),
    horario: texto(o.horario),
    // All four or nothing: a partial origin produces a wrong quote rather than
    // no quote, and a wrong shipping price is charged to a real customer.
    origen: cp && estado && municipio && colonia ? { cp, estado, municipio, colonia } : null,
  };
}

/**
 * Where a courier or a customer navigates to for a pickup.
 *
 * Derived rather than stored: it is the address again, and two fields that must
 * agree eventually stop agreeing.
 */
export function mapsUrl(t: TiendaInfo): string | null {
  if (!t.direccion) return null;
  return (
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(t.direccion)
  );
}
