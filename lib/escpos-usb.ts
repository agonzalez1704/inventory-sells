import { formatMXN } from "@/lib/money";
import { imprimirTicketNavegador, type TicketData } from "@/lib/ticket";
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
  /** Printers this origin was already granted — no prompt. */
  getDevices(): Promise<USBDevice[]>;
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

/** Break text into printable lines — a head truncates, it does not wrap. */
function envolver(s: string, ancho: number): string[] {
  const out: string[] = [];
  for (const parrafo of s.split(/\n+/)) {
    let linea = "";
    for (const w of parrafo.split(/\s+/).filter(Boolean)) {
      if (!linea) linea = w.slice(0, ancho);
      else if (linea.length + 1 + w.length <= ancho) linea += ` ${w}`;
      else {
        out.push(linea);
        linea = w.slice(0, ancho);
      }
    }
    if (linea) out.push(linea);
  }
  return out;
}

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
  const cab = d.encabezado?.length ? d.encabezado : ["FIABLE", "Celulares y refacciones"];
  p.align("center").size(true).bold(true).line(cab[0]).size(false).bold(false);
  for (const l of cab.slice(1)) for (const w of envolver(l, WIDTH)) p.line(w);
  if (esFiado) p.bold(true).line("NOTA DE CREDITO - PENDIENTE DE PAGO").bold(false);
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
  if (d.garantia) {
    p.sep();
    // ascii() inside line() strips the accents the head cannot print; the
    // wrapping is ours, because a thermal head just cuts at the column.
    for (const l of envolver(d.garantia, WIDTH)) p.line(l);
  }
  p.sep();
  p.align("center").line(esFiado ? "Comprobante de nota de credito" : "Gracias por su compra!");
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
  // Granted once, silent forever: the permission survives reloads, so the
  // chooser only appears the first time on this computer. Asking every time is
  // what made "imprimir" a two-click dialog dance at the counter.
  const [recordada] = await usb.getDevices().catch((): USBDevice[] => []);
  const device = recordada ?? (await usb.requestDevice({ filters: [] }));
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

/**
 * Print with no dialog when this computer has already been paired with the
 * printer; fall back to the OS dialog when it has not.
 *
 * Returns how it printed, so a caller can say so — "se imprimió" and "elige la
 * impresora" are different outcomes for whoever is at the counter.
 */
export async function imprimirTicketAuto(d: TicketData): Promise<"usb" | "dialogo"> {
  if (await impresoraUsbLista()) {
    try {
      await imprimirTicketUSB(d);
      return "usb";
    } catch {
      // The driver may have claimed the interface since; the dialog still works.
    }
  }
  imprimirTicketNavegador(d);
  return "dialogo";
}

/**
 * Ask for the printer ONCE. The grant is stored by the browser per origin, so
 * from here on printing needs no dialog and no permission prompt.
 */
export async function vincularImpresoraUSB(): Promise<void> {
  const usb = getUsb();
  if (!usb) throw new Error("Este navegador no soporta WebUSB. Usa Chrome o Edge en computadora.");
  const device = await usb.requestDevice({ filters: [] });
  // Open it once: a printer whose interface the Windows driver already owns
  // fails HERE, while the seller can still read why, instead of silently at
  // the first sale.
  await device.open().catch((e: unknown) => {
    throw new Error(
      e instanceof Error && /access|denied|security/i.test(e.message)
        ? "Windows tiene tomada esa impresora con su driver. Usa el acceso directo de Chrome con impresión directa."
        : "No se pudo abrir la impresora.",
    );
  });
  await device.close().catch(() => undefined);
}

/** Is a printer already granted to this computer? Then printing asks nothing. */
export async function impresoraUsbLista(): Promise<boolean> {
  const usb = getUsb();
  if (!usb) return false;
  const ds = await usb.getDevices().catch((): USBDevice[] => []);
  return ds.length > 0;
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
  if (d.ganancia !== null) p.lr("Ganancia neta (venta)", formatMXN(d.ganancia));
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
