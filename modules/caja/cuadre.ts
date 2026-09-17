import "server-only";

import { insforgeAdmin } from "@/lib/insforge/admin";
import { rangoUTC } from "@/lib/caja-range";

// "Cuadre del día": the drawer of one sucursal on one day, event by event, with
// what there should be after each one, the counts people made, and the things
// that most often explain a difference. Same money rules as the corte
// (app/(app)/caja/page.tsx): direct sales at their total (mixto's money is in
// sale_pagos), credit notes by each abono, adelanto abonos/refunds, ingresos
// extra, gastos, returns. A movement belongs to the drawer of the sucursal
// where its registrar checked in that day.

export type TipoEvento = "venta" | "cobro_fiado" | "adelanto" | "devolucion_adelanto" | "ingreso" | "gasto" | "devolucion";

export type EventoCaja = {
  id: string;
  fecha: string;
  tipo: TipoEvento;
  metodo: string;
  /** Signed: money in > 0, money out < 0. */
  montoCents: number;
  titulo: string;
  detalle: string | null;
  quienId: string | null;
  quien: string;
  saleId: string | null;
  /** Sucursal id, or null when the registrar had no check-in that day. */
  sucursalId: string | null;
  marca: string | null;
};

export type ConteoCaja = {
  id: string;
  tipo: "conteo" | "cierre";
  contadoCents: number;
  /** Snapshot at the moment of the count. */
  esperadoCents: number;
  /** Same moment, recomputed with today's data: differs after corrections. */
  esperadoAhoraCents: number;
  desglose: Record<string, number> | null;
  fondoSiguienteCents: number | null;
  nota: string | null;
  quien: string;
  createdAt: string;
};

export type Sospechoso = {
  clave: string;
  titulo: string;
  detalle: string;
  meta: string;
  montoCents: number;
  /** Its amount equals the difference of the latest count. */
  coincide: boolean;
  saleId: string | null;
};

export type DiaSemana = {
  fecha: string;
  estado: "cuadro" | "diferencia" | "sin_cerrar" | "sin_movimientos";
  diferenciaCents: number;
};

export type Cuadre = {
  fecha: string;
  sucursalId: string | null;
  sucursales: { id: string; nombre: string }[];
  /** Float left by the previous close; null when there is none. */
  fondoCents: number | null;
  eventos: EventoCaja[];
  conteos: ConteoCaja[];
  entradasCents: number;
  salidasCents: number;
  esperadoCents: number;
  diferenciaCents: number | null;
  sospechosos: Sospechoso[];
  porPersona: { quien: string; entradasCents: number; salidasCents: number; otrosCents: number; otros: number }[];
  semana: DiaSemana[];
  /** Cash moved today by people with no check-in: in no drawer. */
  sinSucursal: { n: number; montoCents: number };
};

const TZ = "America/Mexico_City";
const diaMX = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
const horaMX = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const diaCorto = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
const pesos = (c: number) =>
  "$" + (Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const esEfectivo = (e: Pick<EventoCaja, "metodo">) => e.metodo === "efectivo";

function sumarDias(fecha: string, n: number) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

type Item = { qty: number; products: { name: string } | null };
const nombres = (items: Item[] | null | undefined) =>
  (items ?? []).map((i) => `${i.qty > 1 ? `${i.qty}× ` : ""}${i.products?.name ?? "—"}`).join(", ") || "Sin productos";

/** Every money event in [from, to] (MX dates), attributed to a sucursal. */
async function eventosRango(from: string, to: string) {
  const { startISO, endISO } = rangoUTC(from, to);
  const db = insforgeAdmin.database;
  const [ventas, pagos, adelPagos, ingresos, gastos, devoluciones, checkins] = await Promise.all([
    db
      .from("sales")
      .select("id, total_cents, payment_method, created_at, sold_by, customer_name, sale_items(qty, products(name))")
      .eq("status", "completed")
      .is("settled_at", null)
      .gte("created_at", startISO)
      .lt("created_at", endISO),
    db
      .from("sale_pagos")
      .select("id, sale_id, monto_cents, metodo, created_at, created_by, sales(created_at, total_cents, status, customer_name, sale_items(qty, products(name)))")
      .gte("created_at", startISO)
      .lt("created_at", endISO),
    db
      .from("adelanto_pagos")
      .select("id, monto_cents, metodo, tipo, created_at, created_by, adelantos(cliente, descripcion, products(name))")
      .gte("created_at", startISO)
      .lt("created_at", endISO),
    db.from("ingresos").select("id, concepto, monto_cents, metodo, categoria, created_at, created_by").gte("created_at", startISO).lt("created_at", endISO),
    db.from("gastos").select("id, concepto, monto_cents, metodo, categoria, created_at, created_by").gte("created_at", startISO).lt("created_at", endISO),
    db.from("devoluciones").select("id, sale_id, monto_cents, metodo, motivo, created_at, created_by").gte("created_at", startISO).lt("created_at", endISO),
    db.from("checkins").select("profile_id, sucursal_id, created_at").gte("created_at", startISO).lt("created_at", endISO).order("created_at"),
  ]);

  const checkinDe = new Map<string, string>();
  for (const c of (checkins.data ?? []) as { profile_id: string; sucursal_id: string; created_at: string }[]) {
    const k = `${c.profile_id}|${diaMX(c.created_at)}`;
    if (!checkinDe.has(k)) checkinDe.set(k, c.sucursal_id);
  }
  const suc = (quien: string | null, iso: string) => (quien ? (checkinDe.get(`${quien}|${diaMX(iso)}`) ?? null) : null);

  type V = { id: string; total_cents: number; payment_method: string | null; created_at: string; sold_by: string | null; customer_name: string | null; sale_items: Item[] };
  type Pg = {
    id: string;
    sale_id: string;
    monto_cents: number;
    metodo: string;
    created_at: string;
    created_by: string | null;
    sales: { created_at: string; total_cents: number; status: string; customer_name: string | null; sale_items: Item[] } | null;
  };
  type Ap = { id: string; monto_cents: number; metodo: string; tipo: string; created_at: string; created_by: string | null; adelantos: { cliente: string | null; descripcion: string | null; products: { name: string } | null } | null };
  type Mov = { id: string; concepto: string; monto_cents: number; metodo: string; categoria: string | null; created_at: string; created_by: string | null };
  type Dv = { id: string; sale_id: string | null; monto_cents: number; metodo: string; motivo: string | null; created_at: string; created_by: string | null };

  const base = (quienId: string | null, iso: string) => ({ quienId, quien: "", fecha: iso, sucursalId: suc(quienId, iso), marca: null });
  const ev: EventoCaja[] = [];
  for (const v of (ventas.data ?? []) as unknown as V[]) {
    if (v.payment_method === "mixto") continue;
    ev.push({
      ...base(v.sold_by, v.created_at),
      id: `v:${v.id}`,
      tipo: "venta",
      metodo: v.payment_method ?? "otro",
      montoCents: v.total_cents,
      titulo: nombres(v.sale_items),
      detalle: v.customer_name?.trim() && v.customer_name !== "Mostrador" ? v.customer_name.trim() : null,
      saleId: v.id,
    });
  }
  const pagosRows = (pagos.data ?? []) as unknown as Pg[];
  for (const p of pagosRows) {
    ev.push({
      ...base(p.created_by, p.created_at),
      id: `p:${p.id}`,
      tipo: "cobro_fiado",
      metodo: p.metodo,
      montoCents: p.monto_cents,
      titulo: nombres(p.sales?.sale_items),
      detalle: p.sales
        ? diaMX(p.sales.created_at) === diaMX(p.created_at)
          ? `vendida hoy ${horaMX(p.sales.created_at)}`
          : `vendida el ${diaCorto(p.sales.created_at)}`
        : null,
      saleId: p.sale_id,
    });
  }
  for (const a of (adelPagos.data ?? []) as unknown as Ap[]) {
    const que = a.adelantos?.products?.name ?? a.adelantos?.descripcion ?? a.adelantos?.cliente ?? "Adelanto";
    ev.push({
      ...base(a.created_by, a.created_at),
      id: `a:${a.id}`,
      tipo: a.tipo === "devolucion" ? "devolucion_adelanto" : "adelanto",
      metodo: a.metodo,
      montoCents: a.tipo === "devolucion" ? -a.monto_cents : a.monto_cents,
      titulo: que,
      detalle: a.adelantos?.cliente ?? null,
      saleId: null,
    });
  }
  for (const m of (ingresos.data ?? []) as Mov[])
    ev.push({ ...base(m.created_by, m.created_at), id: `i:${m.id}`, tipo: "ingreso", metodo: m.metodo, montoCents: m.monto_cents, titulo: m.concepto, detalle: m.categoria, saleId: null });
  for (const m of (gastos.data ?? []) as Mov[])
    ev.push({ ...base(m.created_by, m.created_at), id: `g:${m.id}`, tipo: "gasto", metodo: m.metodo, montoCents: -m.monto_cents, titulo: m.concepto, detalle: m.categoria, saleId: null });
  for (const d of (devoluciones.data ?? []) as Dv[])
    ev.push({ ...base(d.created_by, d.created_at), id: `d:${d.id}`, tipo: "devolucion", metodo: d.metodo, montoCents: -d.monto_cents, titulo: d.motivo || "Devolución", detalle: null, saleId: d.sale_id });

  return { eventos: ev.sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha)), pagosRows, suc };
}

const enCajon = (e: EventoCaja, sucursalId: string | null, haySucursales: boolean) =>
  !haySucursales || e.sucursalId === sucursalId;

/** The drawer of `sucursalId` (null when the business has no sucursales) on `fecha`. */
export async function cuadreDelDia(fecha: string, sucursalId: string | null): Promise<Cuadre> {
  const db = insforgeAdmin.database;
  const { data: sucData } = await db.from("sucursales").select("id, nombre").eq("is_active", true).order("nombre");
  const sucursales = (sucData ?? []) as { id: string; nombre: string }[];
  const hay = sucursales.length > 0;
  const suc = hay ? (sucursales.some((s) => s.id === sucursalId) ? sucursalId : sucursales[0].id) : null;

  const desde = sumarDias(fecha, -6);
  const { startISO, endISO } = rangoUTC(fecha, fecha);
  const [{ eventos: todos, pagosRows, suc: sucursalDe }, conteosRes, previoRes] = await Promise.all([
    eventosRango(desde, fecha),
    (suc ? db.from("caja_conteos").select("*").eq("sucursal_id", suc) : db.from("caja_conteos").select("*").is("sucursal_id", null))
      .gte("fecha", desde)
      .lte("fecha", fecha)
      .order("created_at"),
    (suc ? db.from("caja_conteos").select("fondo_siguiente_cents, fecha").eq("sucursal_id", suc) : db.from("caja_conteos").select("fondo_siguiente_cents, fecha").is("sucursal_id", null))
      .eq("tipo", "cierre")
      .lt("fecha", fecha)
      .order("fecha", { ascending: false })
      .limit(1),
  ]);

  type ConteoRow = {
    id: string;
    fecha: string;
    tipo: "conteo" | "cierre";
    contado_cents: number;
    esperado_cents: number;
    desglose: Record<string, number> | null;
    fondo_siguiente_cents: number | null;
    nota: string | null;
    created_by: string | null;
    created_at: string;
  };
  const conteosRows = (conteosRes.data ?? []) as ConteoRow[];
  const previo = ((previoRes.data ?? []) as { fondo_siguiente_cents: number | null }[])[0];
  const fondoCents = previo?.fondo_siguiente_cents ?? null;

  const delDia = todos.filter((e) => diaMX(e.fecha) === fecha);
  const eventos = delDia.filter((e) => enCajon(e, suc, hay));
  const sinCajon = hay ? delDia.filter((e) => e.sucursalId === null && esEfectivo(e)) : [];

  // Names for everyone on screen.
  const ids = [...new Set([...eventos.map((e) => e.quienId), ...conteosRows.map((c) => c.created_by)].filter(Boolean))] as string[];
  const { data: profs } = ids.length ? await db.from("profiles").select("id, full_name").in("id", ids) : { data: [] };
  const nombre = new Map(((profs ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name?.trim() || "—"]));
  for (const e of eventos) e.quien = e.quienId ? (nombre.get(e.quienId) ?? "—") : "—";

  const efectivo = eventos.filter(esEfectivo);
  const entradasCents = efectivo.filter((e) => e.montoCents > 0).reduce((s, e) => s + e.montoCents, 0);
  const salidasCents = -efectivo.filter((e) => e.montoCents < 0).reduce((s, e) => s + e.montoCents, 0);
  const esperadoCents = (fondoCents ?? 0) + entradasCents - salidasCents;
  const esperadoHasta = (iso: string) =>
    (fondoCents ?? 0) + efectivo.filter((e) => Date.parse(e.fecha) <= Date.parse(iso)).reduce((t, e) => t + e.montoCents, 0);

  const conteos: ConteoCaja[] = conteosRows
    .filter((c) => c.fecha === fecha)
    .map((c) => ({
      id: c.id,
      tipo: c.tipo,
      contadoCents: Number(c.contado_cents),
      esperadoCents: Number(c.esperado_cents),
      esperadoAhoraCents: esperadoHasta(c.created_at),
      desglose: c.desglose,
      fondoSiguienteCents: c.fondo_siguiente_cents == null ? null : Number(c.fondo_siguiente_cents),
      nota: c.nota,
      quien: c.created_by ? (nombre.get(c.created_by) ?? "—") : "—",
      createdAt: c.created_at,
    }));
  const ultimo = conteos.at(-1);
  // The latest count against what there should have been at that moment,
  // with today's data: fixing the cause (a wrong charge) closes the gap.
  const diferenciaCents = ultimo ? ultimo.contadoCents - ultimo.esperadoAhoraCents : null;

  // ---- What to check first
  const sos: Sospechoso[] = [];
  const pagosDeVenta = new Map<string, number>();
  const { data: todosPagos } = await db
    .from("sale_pagos")
    .select("sale_id, monto_cents")
    .in("sale_id", [...new Set(pagosRows.map((p) => p.sale_id))].length ? [...new Set(pagosRows.map((p) => p.sale_id))] : ["00000000-0000-0000-0000-000000000000"]);
  for (const p of (todosPagos ?? []) as { sale_id: string; monto_cents: number }[])
    pagosDeVenta.set(p.sale_id, (pagosDeVenta.get(p.sale_id) ?? 0) + p.monto_cents);

  const pagosHoy = new Map(pagosRows.map((p) => [`p:${p.id}`, p]));
  for (const e of eventos.filter((x) => x.tipo === "cobro_fiado")) {
    const p = pagosHoy.get(e.id);
    const venta = p?.sales;
    if (!p || !venta) continue;
    const pagado = pagosDeVenta.get(p.sale_id) ?? 0;
    const delta = pagado - venta.total_cents;
    if ((venta.status === "completed" && delta !== 0) || delta > 0) {
      e.marca = delta > 0 ? "Cobro ≠ venta" : "Cobro incompleto";
      sos.push({
        clave: `cobro:${p.sale_id}`,
        titulo: delta > 0 ? "Cobro mayor que la venta" : "Cobro menor que la venta",
        detalle: `${e.titulo} · se cobraron ${pesos(pagado)} y la venta vale ${pesos(venta.total_cents)}`,
        meta: `${horaMX(e.fecha)} · ${e.quien}`,
        montoCents: delta,
        coincide: false,
        saleId: p.sale_id,
      });
    }
    if (diaMX(venta.created_at) !== fecha && esEfectivo(e)) {
      e.marca ??= "De otro día";
      sos.push({
        clave: `otrodia:${e.id}`,
        titulo: "Fiado de otro día cobrado hoy",
        detalle: `${e.titulo} · vendida el ${diaCorto(venta.created_at)}, cobrada hoy ${horaMX(e.fecha)}`,
        meta: `Suma al cajón de hoy, no al del ${diaCorto(venta.created_at)}`,
        montoCents: e.montoCents,
        coincide: false,
        saleId: p.sale_id,
      });
    }
  }

  const [pendientes, transferIds, auditoria] = await Promise.all([
    db
      .from("sales")
      .select("id, total_cents, created_at, sold_by, customer_name, sale_items(qty, products(name))")
      .eq("status", "pending")
      .gte("created_at", startISO)
      .lt("created_at", endISO),
    (async () => {
      const ventasTrans = eventos.filter((e) => e.metodo === "transferencia" && e.saleId).map((e) => e.saleId!) as string[];
      if (!ventasTrans.length) return new Set<string>();
      const [{ data: comps }, { data: ords }] = await Promise.all([
        db.from("comprobantes_pago").select("sale_id").in("sale_id", ventasTrans),
        db.from("ordenes_web").select("sale_id").in("sale_id", ventasTrans),
      ]);
      return new Set([
        ...((comps ?? []) as { sale_id: string }[]).map((c) => c.sale_id),
        // A web order's payment is verified on the order itself.
        ...((ords ?? []) as { sale_id: string }[]).map((o) => o.sale_id),
      ]);
    })(),
    db.from("caja_auditoria").select("entidad, entidad_id, accion, antes, despues, quien, created_at").gte("created_at", startISO).lt("created_at", endISO).order("created_at"),
  ]);

  for (const v of (pendientes.data ?? []) as unknown as { id: string; total_cents: number; created_at: string; sold_by: string | null; customer_name: string | null; sale_items: Item[] }[]) {
    if (hay && sucursalDe(v.sold_by, v.created_at) !== suc) continue;
    sos.push({
      clave: `pendiente:${v.id}`,
      titulo: "Fiado de hoy sin cobrar",
      detalle: `${nombres(v.sale_items)}${v.customer_name?.trim() && v.customer_name !== "Mostrador" ? ` · ${v.customer_name.trim()}` : ""}`,
      meta: `${horaMX(v.created_at)} · ¿se cobró sin registrarlo?`,
      montoCents: v.total_cents,
      coincide: false,
      saleId: v.id,
    });
  }

  for (const e of eventos.filter((x) => x.metodo === "transferencia" && x.saleId && !transferIds.has(x.saleId!))) {
    sos.push({
      clave: `transfer:${e.id}`,
      titulo: "Transferencia sin comprobante",
      detalle: `${e.titulo}${e.detalle && e.tipo === "venta" ? ` · ${e.detalle}` : ""}`,
      meta: `${horaMX(e.fecha)} · ${e.quien} · ¿se pagó en efectivo?`,
      montoCents: e.montoCents,
      coincide: false,
      saleId: e.saleId,
    });
  }

  type Aud = { entidad: string; entidad_id: string; accion: string; antes: Record<string, unknown>; despues: Record<string, unknown> | null; quien: string | null; created_at: string };
  for (const a of (auditoria.data ?? []) as Aud[]) {
    if (a.accion === "borrado") {
      const monto = Number(a.antes.monto_cents ?? 0);
      const que = a.entidad === "gasto" ? "Gasto borrado" : a.entidad === "ingreso" ? "Ingreso extra borrado" : "Cobro de fiado borrado";
      sos.push({
        clave: `borrado:${a.entidad_id}`,
        titulo: que,
        detalle: `${String(a.antes.concepto ?? "")} · ${String(a.antes.metodo ?? "")}`.replace(/^ · /, ""),
        meta: `Borrado a las ${horaMX(a.created_at)}`,
        montoCents: monto,
        coincide: false,
        saleId: a.entidad === "pago_fiado" ? String(a.antes.sale_id ?? "") || null : null,
      });
    } else if (a.entidad === "venta" && a.despues) {
      const cambios: string[] = [];
      if (a.antes.payment_method !== a.despues.payment_method) cambios.push(`pago ${a.antes.payment_method} → ${a.despues.payment_method}`);
      if (a.antes.total_cents !== a.despues.total_cents) cambios.push(`total ${pesos(Number(a.antes.total_cents))} → ${pesos(Number(a.despues.total_cents))}`);
      if (a.antes.status !== a.despues.status && a.despues.status === "void") cambios.push("anulada");
      if (!cambios.length) continue;
      const monto =
        a.antes.total_cents !== a.despues.total_cents
          ? Number(a.despues.total_cents) - Number(a.antes.total_cents)
          : Number(a.despues.total_cents ?? a.antes.total_cents ?? 0);
      sos.push({
        clave: `cambio:${a.entidad_id}:${a.created_at}`,
        titulo: "Venta modificada",
        detalle: cambios.join(" · "),
        meta: `Cambio a las ${horaMX(a.created_at)}${a.antes.created_at ? ` · venta del ${diaCorto(String(a.antes.created_at))}` : ""}`,
        montoCents: monto,
        coincide: false,
        saleId: a.entidad_id,
      });
    }
  }

  for (const e of eventos.filter((x) => (x.tipo === "devolucion" || x.tipo === "devolucion_adelanto") && esEfectivo(x))) {
    sos.push({
      clave: `devol:${e.id}`,
      titulo: "Devolución en efectivo",
      detalle: e.titulo,
      meta: `${horaMX(e.fecha)} · ${e.quien}`,
      montoCents: e.montoCents,
      coincide: false,
      saleId: e.saleId,
    });
  }

  if (sinCajon.length) {
    const monto = sinCajon.reduce((s, e) => s + e.montoCents, 0);
    sos.push({
      clave: "sin-sucursal",
      titulo: "Efectivo de alguien sin check-in",
      detalle: `${sinCajon.length} ${sinCajon.length === 1 ? "movimiento" : "movimientos"} que no entran a ningún cajón`,
      meta: "Se ven en Caja → Sin sucursal",
      montoCents: monto,
      coincide: false,
      saleId: null,
    });
  }

  if (diferenciaCents) {
    for (const s of sos) s.coincide = Math.abs(s.montoCents) === Math.abs(diferenciaCents);
  }
  const orden = ["cobro", "cambio", "borrado", "pendiente", "transfer", "otrodia", "devol", "sin-sucursal"];
  sos.sort((a, b) => Number(b.coincide) - Number(a.coincide) || orden.indexOf(a.clave.split(":")[0]) - orden.indexOf(b.clave.split(":")[0]));

  // ---- Per person
  const personas = new Map<string, { quien: string; entradasCents: number; salidasCents: number; otrosCents: number; otros: number }>();
  for (const e of eventos) {
    const p = personas.get(e.quien) ?? { quien: e.quien, entradasCents: 0, salidasCents: 0, otrosCents: 0, otros: 0 };
    if (!esEfectivo(e)) {
      p.otrosCents += e.montoCents;
      p.otros += 1;
    } else if (e.montoCents > 0) p.entradasCents += e.montoCents;
    else p.salidasCents -= e.montoCents;
    personas.set(e.quien, p);
  }

  // ---- The week, oldest first
  const semana: DiaSemana[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = sumarDias(fecha, -i);
    const cierre = conteosRows.find((c) => c.fecha === d && c.tipo === "cierre");
    const hubo = todos.some((e) => diaMX(e.fecha) === d && enCajon(e, suc, hay));
    if (cierre) {
      const dif = Number(cierre.contado_cents) - Number(cierre.esperado_cents);
      semana.push({ fecha: d, estado: dif === 0 ? "cuadro" : "diferencia", diferenciaCents: dif });
    } else semana.push({ fecha: d, estado: hubo ? "sin_cerrar" : "sin_movimientos", diferenciaCents: 0 });
  }

  return {
    fecha,
    sucursalId: suc,
    sucursales,
    fondoCents,
    eventos,
    conteos,
    entradasCents,
    salidasCents,
    esperadoCents,
    diferenciaCents,
    sospechosos: sos,
    porPersona: [...personas.values()].sort((a, b) => b.entradasCents - a.entradasCents),
    semana,
    sinSucursal: { n: sinCajon.length, montoCents: sinCajon.reduce((s, e) => s + e.montoCents, 0) },
  };
}
