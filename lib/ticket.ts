import { formatMXN } from "@/lib/money";

// A receipt to print on the Hostech HT-100 (80mm thermal, ~48 mono chars).
export type TicketItem = {
  nombre: string;
  qty: number;
  precioUnit: number; // cents
  total: number; // cents
};
export type TicketData = {
  folio: string;
  fecha: string; // ISO
  items: TicketItem[];
  total: number; // cents
  metodoPago?: string | null;
  cliente?: string | null;
  tipo?: "venta" | "fiado";
};

const PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  otro: "Otro",
};

const esc = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

const folioCorto = (folio: string) =>
  folio.replace(/-/g, "").slice(0, 8).toUpperCase();

// Self-contained HTML document sized for an 80mm roll, printed via a hidden
// iframe so we never navigate away or trip popup blockers.
export function buildTicketHTML(d: TicketData): string {
  const fecha = new Date(d.fecha).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const esFiado = d.tipo === "fiado";

  const filas = d.items
    .map((it) => {
      const sub = formatMXN(it.total);
      const unit =
        it.qty > 1 ? `<div class="unit">${it.qty} × ${formatMXN(it.precioUnit)}</div>` : "";
      return `<div class="item">
        <div class="row"><span class="name">${esc(it.nombre)}</span><span class="amt">${sub}</span></div>
        ${unit}
      </div>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>Ticket ${folioCorto(d.folio)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 80mm; background: #fff; }
  body {
    font-family: "Menlo", "Consolas", monospace;
    color: #000; font-size: 12px; line-height: 1.35;
    padding: 4mm 4mm 6mm;
  }
  .center { text-align: center; }
  .brand { font-size: 20px; font-weight: 800; letter-spacing: 2px; }
  .muted { color: #000; opacity: .8; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .meta { display: flex; justify-content: space-between; gap: 8px; }
  .item { margin: 3px 0; }
  .row { display: flex; justify-content: space-between; gap: 8px; }
  .name { word-break: break-word; }
  .amt { white-space: nowrap; font-variant-numeric: tabular-nums; }
  .unit { font-size: 11px; opacity: .8; }
  .total { display: flex; justify-content: space-between; font-size: 15px; font-weight: 800; }
  .tag { display: inline-block; border: 1px solid #000; padding: 1px 6px; font-weight: 700; }
  .foot { margin-top: 8px; }
</style></head>
<body>
  <div class="center brand">FIABLE</div>
  <div class="center muted">Celulares y refacciones</div>
  ${esFiado ? `<div class="center" style="margin-top:4px"><span class="tag">FIADO · PENDIENTE DE PAGO</span></div>` : ""}
  <div class="sep"></div>
  <div class="meta"><span>Folio: ${folioCorto(d.folio)}</span><span>${esc(fecha)}</span></div>
  ${d.cliente ? `<div>Cliente: ${esc(d.cliente)}</div>` : ""}
  <div class="sep"></div>
  ${filas}
  <div class="sep"></div>
  <div class="total"><span>TOTAL</span><span>${formatMXN(d.total)}</span></div>
  ${d.metodoPago && !esFiado ? `<div>Pago: ${PAGO[d.metodoPago] ?? d.metodoPago}</div>` : ""}
  <div class="sep"></div>
  <div class="center foot">${esFiado ? "Comprobante de fiado" : "¡Gracias por su compra!"}</div>
  <div class="center muted">fiable.vercel.app</div>
</body></html>`;
}

// Print any self-contained HTML document via a hidden iframe and the OS dialog
// (works with any printer the device knows: USB, Bluetooth or network, through
// the installed Hostech driver). Shared by the product ticket and the corte.
export function printViaIframe(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
  });
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();

  const run = () => {
    try {
      win.focus();
      win.print();
    } finally {
      setTimeout(() => iframe.remove(), 1500);
    }
  };
  // Give the thermal layout a tick to settle before invoking the dialog.
  if (win.document.readyState === "complete") setTimeout(run, 80);
  else iframe.onload = () => setTimeout(run, 80);
}

export function imprimirTicketNavegador(d: TicketData): void {
  printViaIframe(buildTicketHTML(d));
}

// Build a TicketData from the sale's parts (used by the cart and recent sales).
export function ticketDesdeVenta(args: {
  folio: string;
  items: TicketItem[];
  total: number;
  metodoPago?: string | null;
  cliente?: string | null;
  tipo?: "venta" | "fiado";
  fecha?: string;
}): TicketData {
  return {
    folio: args.folio,
    fecha: args.fecha ?? new Date().toISOString(),
    items: args.items,
    total: args.total,
    metodoPago: args.metodoPago ?? null,
    cliente: args.cliente ?? null,
    tipo: args.tipo ?? "venta",
  };
}
