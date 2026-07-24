// Client-safe constants. lib/conekta.ts is server-only ("server-only" import),
// so the UI can't read VOUCHER_HORAS from there — mirrored here for copy.
export const VOUCHER_HORAS_UI = 48;

export type ConektaMethod = "card" | "oxxo" | "spei" | "aplazo";

// Everything the checkout can offer. "transferencia" is a direct bank transfer
// that bypasses Conekta and is confirmed by an admin — not a Conekta method.
export type MetodoPago = ConektaMethod | "transferencia";

export function esConekta(m: MetodoPago): m is ConektaMethod {
  return m !== "transferencia";
}
