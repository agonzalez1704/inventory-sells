import { formatMXN } from "@/lib/money";
import { printViaIframe, type TicketData } from "@/lib/ticket";
import type { Loan } from "./LoansView";

/**
 * A credit note's paperwork: the reprinted ticket, the receipt for one abono,
 * and the account statement — printed on the roll, or sent as a WhatsApp
 * message the seller reviews before pressing send.
 */

export type PieNota = {
  encabezado: string[] | null;
  garantia: string | null;
};

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

export const quienDebe = (l: Loan): string =>
  l.cliente && !l.cliente.is_system ? l.cliente.nombre : l.note?.trim() || "Sin cliente";

export const resta = (l: Loan): number => Math.max(0, l.total_cents - l.pagado_cents);

const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" });

/** The note itself, reprinted: what was taken, what is paid, what is owed. */
export function ticketDeNota(l: Loan, pie: PieNota): TicketData {
  return {
    folio: l.id,
    fecha: l.created_at,
    items: l.sale_items
      .filter((it) => it.products)
      .map((it) => ({
        nombre: it.products?.name ?? "Producto",
        qty: it.qty,
        precioUnit: Math.round(l.total_cents / Math.max(1, l.sale_items.reduce((s, i) => s + i.qty, 0))),
        total: 0,
      })),
    total: l.total_cents,
    metodoPago: null,
    cliente: quienDebe(l),
    tipo: "fiado",
    abonado: l.pagado_cents,
    resta: resta(l),
    encabezado: pie.encabezado,
    garantia: pie.garantia,
  };
}

/** The receipt for one payment against the note. */
export function ticketDeAbono(
  l: Loan,
  abono: { monto_cents: number; metodo: string | null; created_at: string },
  restanteDespues: number,
  pie: PieNota,
): TicketData {
  return {
    folio: l.id,
    fecha: abono.created_at,
    items: [{ nombre: `Abono a nota del ${fecha(l.created_at)}`, qty: 1, precioUnit: abono.monto_cents, total: abono.monto_cents }],
    total: abono.monto_cents,
    metodoPago: abono.metodo,
    cliente: quienDebe(l),
    tipo: "venta",
    resta: restanteDespues,
    encabezado: pie.encabezado,
    garantia: null,
  };
}

/** Every open note of one debtor, with its abonos — printed on the roll. */
export function imprimirEstadoCuenta(nombre: string, notas: Loan[], pie: PieNota): void {
  const total = notas.reduce((s, l) => s + resta(l), 0);
  const filas = notas
    .map((l) => {
      const piezas = l.sale_items
        .map((it) => `${it.qty > 1 ? `${it.qty}x ` : ""}${it.products?.name ?? "Producto"}`)
        .join(", ");
      return `<div class="nota">
        <div class="row"><span>${fecha(l.created_at)}</span><span class="amt">${formatMXN(l.total_cents)}</span></div>
        <div class="piezas">${esc(piezas)}</div>
        ${l.pagado_cents > 0 ? `<div class="row small"><span>Abonado</span><span class="amt">-${formatMXN(l.pagado_cents)}</span></div>` : ""}
        <div class="row bold"><span>Resta</span><span class="amt">${formatMXN(resta(l))}</span></div>
      </div>`;
    })
    .join("");

  const cabeza = (pie.encabezado?.length ? pie.encabezado : ["ESTADO DE CUENTA"])
    .map((l, i) => `<div class="center ${i === 0 ? "brand" : "muted"}">${esc(l)}</div>`)
    .join("");

  printViaIframe(`<!doctype html><html><head><meta charset="utf-8"><title>Estado de cuenta</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 80mm; background: #fff; }
  body { font-family: "Menlo", "Consolas", monospace; color: #000; font-size: 12px; line-height: 1.35; padding: 4mm 4mm 6mm; }
  .center { text-align: center; }
  .brand { font-size: 18px; font-weight: 800; letter-spacing: 1px; }
  .muted { opacity: .8; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .small { font-size: 11px; opacity: .85; }
  .bold { font-weight: 700; }
  .amt { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .nota { margin: 6px 0; }
  .piezas { font-size: 11px; opacity: .85; word-break: break-word; }
  .total { display: flex; justify-content: space-between; font-size: 15px; font-weight: 800; }
</style></head>
<body>
  ${cabeza}
  <div class="center muted">Estado de cuenta</div>
  <div class="sep"></div>
  <div>Cliente: ${esc(nombre)}</div>
  <div>Fecha: ${esc(new Date().toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }))}</div>
  <div class="sep"></div>
  ${filas}
  <div class="sep"></div>
  <div class="total"><span>TOTAL QUE DEBE</span><span>${formatMXN(total)}</span></div>
  <div class="sep"></div>
  <div class="center muted">Conserva este comprobante</div>
</body></html>`);
}

/** The same statement as a message, for the seller to send by hand. */
export function textoEstadoCuenta(nombre: string, notas: Loan[]): string {
  const total = notas.reduce((s, l) => s + resta(l), 0);
  const lineas = notas.map((l) => {
    const piezas = l.sale_items
      .map((it) => `${it.qty > 1 ? `${it.qty}x ` : ""}${it.products?.name ?? "Producto"}`)
      .join(", ");
    const abono = l.pagado_cents > 0 ? ` (abonó ${formatMXN(l.pagado_cents)})` : "";
    return `• ${fecha(l.created_at)} — ${piezas}: ${formatMXN(resta(l))}${abono}`;
  });
  return [
    `Hola ${nombre}, te comparto tu estado de cuenta:`,
    "",
    ...lineas,
    "",
    `Total: ${formatMXN(total)}`,
  ].join("\n");
}

/** One note's reminder, short enough to read on a phone. */
export function textoRecordatorio(l: Loan): string {
  const piezas = l.sale_items
    .map((it) => `${it.qty > 1 ? `${it.qty}x ` : ""}${it.products?.name ?? "Producto"}`)
    .join(", ");
  return `Hola ${quienDebe(l)}, te recuerdo la nota del ${fecha(l.created_at)} (${piezas}). Quedan ${formatMXN(resta(l))} por pagar. ¡Gracias!`;
}

/** wa.me link for a Mexican number, with the message ready to review. */
export function waLink(telefono: string | null | undefined, texto: string): string {
  const d = (telefono ?? "").replace(/\D/g, "");
  const num = d.length === 10 ? `52${d}` : d;
  return `https://wa.me/${num}?text=${encodeURIComponent(texto)}`;
}
