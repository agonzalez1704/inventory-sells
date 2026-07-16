// Client-safe constants. lib/conekta.ts is server-only ("server-only" import),
// so the UI can't read VOUCHER_HORAS from there — mirrored here for copy.
export const VOUCHER_HORAS_UI = 48;

export type ConektaMethod = "card" | "oxxo" | "spei" | "aplazo";
