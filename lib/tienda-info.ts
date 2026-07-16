// Customer-facing commitments for the storefront. Single source of truth —
// these are promises to real customers, so they live in one place and must match
// what the business actually honors.
//
// No free-shipping threshold on purpose: at a 12.7% real margin and a $388
// average ticket (max ever: $1,680), giving away a ~$150 guía costs ~3x the
// margin of a typical order. Shipping is quoted per destination instead.
export const TIENDA = {
  entregaDias: "1 a 2 días",
  garantiaDias: 30,
  garantiaCondicion: "devolviendo la pieza con sus sellos intactos",
  direccion: "5 de Mayo #216, Col. Centro, León, Guanajuato",
  ciudad: "León, Gto.",
  horario: "Lun–Sáb · 10:00–19:00",
} as const;
