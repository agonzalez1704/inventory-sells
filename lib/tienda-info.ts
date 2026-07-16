// Customer-facing commitments for the storefront. Single source of truth —
// these are promises to real customers, so they live in one place and must match
// what the business actually honors.
export const TIENDA = {
  envioGratisDesdeCents: 250_000, // $2,500 MXN
  entregaDias: "1 a 2 días",
  garantiaDias: 30,
  garantiaCondicion: "devolviendo la pieza con sus sellos intactos",
  direccion: "5 de Mayo #216, Col. Centro, León, Guanajuato",
  ciudad: "León, Gto.",
  horario: "Lun–Sáb · 10:00–19:00",
} as const;
