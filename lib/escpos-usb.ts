import { formatMXN } from "@/lib/money";
import type { TicketData } from "@/lib/ticket";
import type { CorteData } from "@/lib/corte";

// Direct ESC/POS printing over WebUSB — one tap, auto-cut, no OS dialog.
// Chrome/Edge on desktop only, and the USB interface must not be claimed by an
// OS print driver. Best-effort; the browser-dialog path is the reliable one.

// --- Minimal WebUSB typing (not in lib.dom) -------------------------------
type USBEndpoint = { endpointNumber: number; direction: string; type: string };
type USBAlternate = { endpoints: USBEndpoint[] };
type USBInterface = { interfaceNumber: number; alternate: USBAlternate };
type USBConfiguration = { interfaces: USBInterface[] } | null;
type USBDevice = {
  configuration: USBConfiguration;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  transferOut(endpoint: number, data: Uint8Array): Promise<unknown>;
};
type USBApi = {
  requestDevice(opts: { filters: unknown[] }): Promise<USBDevice>;
};

function getUsb(): USBApi | null {
  const u = (navigator as unknown as { usb?: USBApi }).usb;
  return u ?? null;
}

export function webUsbDisponible(): boolean {
  return getUsb() !== null;
}

// --- ESC/POS byte builder -------------------------------------------------
const PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  otro: "Otro",
};
const WIDTH = 48; // 80mm @ Font A

// Thermal heads use a single-byte codepage; strip accents to plain ASCII so
// "batería" doesn't come out garbled.
const ascii = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "");

class EscPos {
  private parts: number[] = [];
  raw(...b: number[]) {
    this.parts.push(...b);
    return this;
  }
  text(s: string) {
    const enc = new TextEncoder().encode(ascii(s));
    this.parts.push(...enc);
    return this;
  }
  line(s = "") {
    return this.text(s).raw(0x0a);
  }
  // Left text + right amount padded to WIDTH.
  lr(left: string, right: string) {
    const l = ascii(left);
    const r = ascii(right);
    const space = Math.max(1, WIDTH - l.length - r.length);
    if (l.length + r.length + 1 > WIDTH) {
      // wrap: name on its own line, amount right-aligned next line
      this.line(l);
      return this.line(" ".repeat(Math.max(0, WIDTH - r.length)) + r);
    }
    return this.line(l + " ".repeat(space) + r);
  }
  align(a: "left" | "center" | "right") {
    return this.raw(0x1b, 0x61, a === "center" ? 1 : a === "right" ? 2 : 0);
  }
  bold(on: boolean) {
    return this.raw(0x1b, 0x45, on ? 1 : 0);
  }
  size(double: boolean) {
    // GS ! n — double width+height when on, normal off
    return this.raw(0x1d, 0x21, double ? 0x11 : 0x00);
  }
  sep() {
    return this.line("-".repeat(WIDTH));
  }
  bytes(): Uint8Array {
    return new Uint8Array(this.parts);
  }
}

export function buildEscPos(d: TicketData): Uint8Array {
  const fecha = new Date(d.fecha).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const folio = d.folio.replace(/-/g, "").slice(0, 8).toUpperCase();
  const esFiado = d.tipo === "fiado";

  const p = new EscPos();
  p.raw(0x1b, 0x40); // init
  p.align("center").size(true).bold(true).line("FIABLE").size(false).bold(false);
  p.line("Celulares y refacciones");
  if (esFiado) p.bold(true).line("FIADO - PENDIENTE DE PAGO").bold(false);
  p.align("left").sep();
  p.lr(`Folio: ${folio}`, fecha);
  if (d.cliente) p.line(`Cliente: ${d.cliente}`);
  p.sep();
  for (const it of d.items) {
    p.lr(it.nombre, formatMXN(it.total));
    if (it.qty > 1) p.line(`  ${it.qty} x ${formatMXN(it.precioUnit)}`);
  }
  p.sep();
  p.bold(true).lr("TOTAL", formatMXN(d.total)).bold(false);
  if (d.metodoPago && !esFiado) p.line(`Pago: ${PAGO[d.metodoPago] ?? d.metodoPago}`);
  p.sep();
  p.align("center").line(esFiado ? "Comprobante de fiado" : "Gracias por su compra!");
  p.line("fiable.vercel.app");
  p.raw(0x0a, 0x0a, 0x0a); // feed
  p.raw(0x1d, 0x56, 0x00); // full cut
  return p.bytes();
}

// Send a raw ESC/POS byte stream to a user-picked USB printer.
export async function enviarBytesUSB(bytes: Uint8Array): Promise<void> {
  const usb = getUsb();
  if (!usb) {
    throw new Error(
      "Este navegador no soporta WebUSB. Usa Chrome o Edge en computadora.",
    );
  }
  const device = await usb.requestDevice({ filters: [] });
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);

  const cfg = device.configuration;
  if (!cfg) throw new Error("No se pudo leer la configuración de la impresora.");

  // Pick the interface that exposes a bulk OUT endpoint.
  let iface = cfg.interfaces.find((i) =>
    i.alternate.endpoints.some((e) => e.direction === "out" && e.type === "bulk"),
  );
  iface ??= cfg.interfaces[0];
  const ep = iface.alternate.endpoints.find(
    (e) => e.direction === "out" && e.type === "bulk",
  );
  if (!ep) throw new Error("La impresora no expone un endpoint de impresión.");

  await device.claimInterface(iface.interfaceNumber);
  await device.transferOut(ep.endpointNumber, bytes);
  await device.close();
}

export async function imprimirTicketUSB(d: TicketData): Promise<void> {
  await enviarBytesUSB(buildEscPos(d));
}

export function buildEscPosCorte(d: CorteData): Uint8Array {
  const gen = new Date(d.generadoEn).toLocaleString("es-MX", {
    dateStyle: "short",
    timeStyle: "short",
  });
  const p = new EscPos();
  p.raw(0x1b, 0x40); // init
  p.align("center").bold(true).line("FIABLE").bold(false);
  p.line("CORTE DE CAJA").line(d.rango);
  p.align("left").sep();
  if (d.lineas.length === 0) p.line("Sin movimientos");
  for (const l of d.lineas) {
    p.lr(l.label, `${formatMXN(l.ingresos)}${l.gastos ? ` /-${formatMXN(l.gastos)}` : ""}`);
  }
  p.sep();
  p.lr("Ventas", String(d.ventasCount));
  p.lr("Ingresos", formatMXN(d.ingresosTotal));
  p.lr(`Gastos (${d.gastosCount})`, `-${formatMXN(d.gastosTotal)}`);
  if (d.devolucionesCount) {
    p.lr(`Devoluciones (${d.devolucionesCount})`, `-${formatMXN(d.devolucionesTotal)}`);
  }
  p.sep();
  p.bold(true).lr("BALANCE", formatMXN(d.balance)).bold(false);
  p.lr("Efectivo en caja", formatMXN(d.efectivoCaja));
  if (d.etiquetado.length) {
    p.sep();
    p.line("Efectivo etiquetado (incluido):");
    for (const e of d.etiquetado) p.lr(e.tag, formatMXN(e.monto));
  }
  p.sep();
  p.align("center").line(`Generado ${gen}`).line("fiable.vercel.app");
  p.raw(0x0a, 0x0a, 0x0a); // feed
  p.raw(0x1d, 0x56, 0x00); // full cut
  return p.bytes();
}

export async function imprimirCorteUSB(d: CorteData): Promise<void> {
  await enviarBytesUSB(buildEscPosCorte(d));
}
