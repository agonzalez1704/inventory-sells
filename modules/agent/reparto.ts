// Pure: which almacén serves how many pieces, and when they arrive. No
// imports, so a script can check it.

export type RutaDia = { llega: number; corte_dia: number; corte: string };
export type Expres = { activo: boolean; dias: number; corte: string; costo: number };

export type Almacen = {
  product_id: string;
  nombre: string;
  almacen: string;
  existencia: number;
  precio_mxn: number;
  /** Working days until it reaches the customer; 0 = on the counter; null = nobody set it. */
  entrega_dias: number | null;
  imagen: string | null;
  /** The counter (oldest almacén): what it has goes out today, on its own quote. */
  es_mostrador: boolean;
  /** Route truck days (ISO 1 = Monday) and their order cutoffs; null = no route. */
  ruta: RutaDia[] | null;
  expres: Expres;
};

export const entregaTexto = (d: number | null) =>
  d === 0 ? "en tienda, inmediata" : d == null ? "tiempo de entrega por confirmar" : `llega en ${d} ${d === 1 ? "día hábil" : "días hábiles"}`;

/** Fill qty from the first almacén on: 4 wanted, 1 here = 1 here + 3 there. Priced rows only. */
export function repartir(almacenes: Almacen[], qty: number) {
  const lineas: (Almacen & { qty: number })[] = [];
  let falta = qty;
  for (const a of almacenes) {
    if (falta <= 0) break;
    if (a.existencia <= 0 || a.precio_mxn <= 0) continue;
    const n = Math.min(falta, a.existencia);
    lineas.push({ ...a, qty: n });
    falta -= n;
  }
  return { lineas, falta };
}

// Dates below are Mexico City wall-clock held in a Date's UTC fields.

/** Now as Mexico City wall-clock. */
export function ahoraMx(d = new Date()): Date {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Mexico_City",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute));
}

// ponytail: Mexico City has had no DST since 2022, so wall-clock + 6 h is the
// real instant. Revisit if it ever comes back.
export const instante = (mx: Date) => new Date(mx.getTime() + 6 * 3_600_000).toISOString();

const diaMas = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
const aLas = (d: Date, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m));
};
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The next route truck the customer still catches. Each truck day has its own
 * cutoff: Monday's closes Saturday 10:00, Wednesday's Tuesday 16:00.
 */
export function proximaRuta(ruta: RutaDia[], ahora: Date): { llega: Date; corte: Date } | null {
  for (let k = 1; k <= 14; k++) {
    const llega = diaMas(ahora, k);
    const r = ruta.find((x) => x.llega === (llega.getUTCDay() || 7));
    if (!r) continue;
    // The last corte_dia before the truck day.
    let back = 1;
    while (back <= 7 && (diaMas(llega, -back).getUTCDay() || 7) !== r.corte_dia) back++;
    const corte = aLas(diaMas(llega, -back), r.corte);
    if (ahora < corte) return { llega, corte };
  }
  return null;
}

/** Exprés: ordered before the cutoff today (Mon–Sat), it arrives `dias` business days later. */
export function proximoExpres(e: Expres, ahora: Date): { llega: Date; corte: Date } | null {
  if (!e.activo) return null;
  let dia = diaMas(ahora, 0);
  while (dia.getUTCDay() === 0 || ahora >= aLas(dia, e.corte)) dia = diaMas(dia, 1);
  const corte = aLas(dia, e.corte);
  let llega = dia;
  for (let n = 0; n < e.dias; ) {
    llega = diaMas(llega, 1);
    if (llega.getUTCDay() !== 0) n++;
  }
  return { llega, corte };
}

const nombreDia = (d: Date) =>
  d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const hora = (d: Date) => {
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h % 12 || 12}:${m} ${h < 12 ? "am" : "pm"}`;
};

export type Opcion = {
  modo: "ruta" | "expres";
  /** What the customer reads. */
  llega: string;
  pide_antes_de: string;
  cargo_mxn: number;
  /** For the quote: arrival date and the real cutoff instant. */
  fecha: string;
  corte: string;
};

/**
 * How pieces from a non-counter almacén reach the customer, who picks. Exprés
 * is only offered when it beats the route: Tuesday before 16:00, Wednesday's
 * truck already arrives tomorrow for free.
 */
export function opcionesEntrega(a: Almacen, ahora: Date): Opcion[] {
  if (a.es_mostrador) return [];
  const op = (modo: Opcion["modo"], x: { llega: Date; corte: Date }, cargo: number): Opcion => ({
    modo,
    llega: nombreDia(x.llega),
    pide_antes_de: `${nombreDia(x.corte)} a las ${hora(x.corte)}`,
    cargo_mxn: cargo,
    fecha: iso(x.llega),
    corte: instante(x.corte),
  });
  const r = a.ruta?.length ? proximaRuta(a.ruta, ahora) : null;
  const e = proximoExpres(a.expres, ahora);
  const out: Opcion[] = [];
  if (r) out.push(op("ruta", r, 0));
  if (e && (!r || e.llega < r.llega)) out.push(op("expres", e, a.expres.costo));
  return out;
}
