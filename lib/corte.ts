import { formatMXN } from "@/lib/money";
import { printViaIframe } from "@/lib/ticket";

// Cash-cut summary printed on the 80mm Hostech HT-100.
export type CorteMetodoLinea = {
  label: string;
  ingresos: number; // cents
  gastos: number; // cents
};
export type CorteData = {
  rango: string; // "29/06/2026" or "26/06 → 29/06"
  generadoEn: string; // ISO
  lineas: CorteMetodoLinea[]; // methods with any movement
  ingresosTotal: number;
  gastosTotal: number;
  devolucionesTotal: number;
  balance: number;
  efectivoCaja: number;
  ventasCount: number;
  gastosCount: number;
  devolucionesCount: number;
  etiquetado: { tag: string; monto: number }[];
  ganancia: number | null;
};

const esc = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

export function buildCorteHTML(d: CorteData): string {
  const gen = new Date(d.generadoEn).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });

  const filas = d.lineas
    .map(
      (l) => `<div class="row"><span>${esc(l.label)}</span><span class="amt">${formatMXN(l.ingresos)}${l.gastos ? ` / −${formatMXN(l.gastos)}` : ""}</span></div>`,
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Corte de caja</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 80mm; background: #fff; }
  body { font-family: "Menlo","Consolas",monospace; color:#000; font-size:12px; line-height:1.4; padding:4mm 4mm 6mm; }
  .center { text-align: center; }
  .brand { font-size: 18px; font-weight: 800; letter-spacing: 2px; }
  .muted { opacity:.8; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .amt { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .big { font-size: 15px; font-weight: 800; }
  .hdr { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; opacity:.7; margin-bottom: 2px; }
</style></head>
<body>
  <div class="center brand">FIABLE</div>
  <div class="center">CORTE DE CAJA</div>
  <div class="center muted">${esc(d.rango)}</div>
  <div class="sep"></div>
  <div class="hdr">Ingresos por método (ventas / gastos)</div>
  ${filas || '<div class="muted">Sin movimientos</div>'}
  <div class="sep"></div>
  <div class="row"><span>Ventas</span><span class="amt">${d.ventasCount}</span></div>
  <div class="row"><span>Ingresos</span><span class="amt">${formatMXN(d.ingresosTotal)}</span></div>
  <div class="row"><span>Gastos (${d.gastosCount})</span><span class="amt">−${formatMXN(d.gastosTotal)}</span></div>
  ${d.devolucionesCount ? `<div class="row"><span>Devoluciones (${d.devolucionesCount})</span><span class="amt">−${formatMXN(d.devolucionesTotal)}</span></div>` : ""}
  <div class="sep"></div>
  <div class="row big"><span>BALANCE</span><span>${formatMXN(d.balance)}</span></div>
  <div class="row"><span>Efectivo en caja</span><span class="amt">${formatMXN(d.efectivoCaja)}</span></div>
  ${d.ganancia !== null ? `<div class="row"><span>Ganancia neta (venta)</span><span class="amt">${formatMXN(d.ganancia)}</span></div>` : ""}
  ${
    d.etiquetado.length
      ? `<div class="sep"></div><div class="hdr">Efectivo etiquetado (incluido arriba)</div>` +
        d.etiquetado
          .map(
            (e) =>
              `<div class="row"><span>${esc(e.tag)}</span><span class="amt">${formatMXN(e.monto)}</span></div>`,
          )
          .join("")
      : ""
  }
  <div class="sep"></div>
  <div class="center muted">Generado ${esc(gen)}</div>
  <div class="center muted">fiable.vercel.app</div>
</body></html>`;
}

export function imprimirCorteNavegador(d: CorteData): void {
  printViaIframe(buildCorteHTML(d));
}
