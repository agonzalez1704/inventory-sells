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
