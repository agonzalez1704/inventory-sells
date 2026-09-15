// Money is stored as integer centavos (MXN). Never use floats for storage.

export function toCents(pesos: number): number {
  return Math.round(pesos * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});

export function formatMXN(cents: number): string {
  return mxn.format(cents / 100);
}

// minimumFractionDigits must be set too: MXN defaults it to 2, and a maximum
// below the minimum throws.
const mxnEntero = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Storefront prices: "$450" — cents only when there are cents. The POS and
 *  every document keep formatMXN, where ".00" is part of the record. */
export function formatPrecio(cents: number): string {
  return cents % 100 === 0 ? mxnEntero.format(cents / 100) : mxn.format(cents / 100);
}
