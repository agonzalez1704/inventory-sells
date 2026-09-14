import "server-only";

import { insforgeAdmin } from "@/lib/insforge/admin";
import { RANGOS, type ConsultaDSL, type Rango } from "./spec";

// Motor del DSL: consultas parametrizadas + agregacion en TS, siguiendo el
// mismo tratamiento de ventas que analytics (completadas directas + fiados
// cobrados por settled_at, para que "ingresos" signifique dinero que entro).
// "ganancia" usa cost_cents y exige costos_ver — quien llama pasa el permiso.

const DB = insforgeAdmin.database;

export type ResultadoConsulta = {
  unidad: "mxn" | "numero";
  valor?: number;
  delta?: number | null;
  serie?: { etiqueta: string; valor: number }[];
  filas?: Record<string, string | number>[];
  columnas?: string[];
};

const pesos = (c: number) => Math.round(c) / 100;

function ventana(rango: Rango, atras = 0) {
  const dias = RANGOS[rango];
  const hasta = new Date(Date.now() - atras * dias * 864e5);
  const desde = new Date(hasta.getTime() - dias * 864e5);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

const diaMX = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", month: "2-digit", day: "2-digit" });
const diaISO = (iso: string) =>
  new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
const semanaMX = (iso: string) => {
  const d = new Date(iso);
  const lunes = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5);
  return `sem ${diaMX(lunes.toISOString())}`;
};

const METODO_LABEL: Record<string, string> = {
  efectivo: "Efectivo", tarjeta: "Tarjeta", transferencia: "Transferencia", otro: "Otro",
};

type VentaFila = {
  id: string;
  total_cents: number;
  payment_method: string | null;
  sold_by: string | null;
  created_at: string;
  settled_at: string | null;
  sale_items: { qty: number; unit_price_cents: number; products: { name: string; sku: string; category: string | null; etiqueta: string | null; cost_cents: number } | null }[];
};

// Ventas del rango: completadas en la ventana (no fiadas) + fiados COBRADOS en
// la ventana — el mismo criterio de corte de caja.
async function ventasRango(rango: Rango, atras: number): Promise<VentaFila[]> {
  const { desde, hasta } = ventana(rango, atras);
  const sel = "id, total_cents, payment_method, sold_by, created_at, settled_at, sale_items(qty, unit_price_cents, products(name, sku, category, etiqueta, cost_cents))";
  const [{ data: directas }, { data: cobradas }] = await Promise.all([
    DB.from("sales").select(sel).eq("status", "completed").is("settled_at", null).gte("created_at", desde).lt("created_at", hasta),
    DB.from("sales").select(sel).eq("status", "completed").gte("settled_at", desde).lt("settled_at", hasta),
  ]);
  return [...((directas ?? []) as unknown as VentaFila[]), ...((cobradas ?? []) as unknown as VentaFila[])];
}

async function nombresVendedores(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data } = await DB.from("profiles").select("id, full_name").in("id", ids);
  return new Map(((data ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? "(sin nombre)"]));
}

async function consultaVentas(c: ConsultaDSL, rango: Rango, atras: number, costosVer: boolean): Promise<ResultadoConsulta> {
  if (c.metrica === "ganancia" && !costosVer) throw new Error("La métrica de ganancia requiere el permiso de costos.");
  const ventas = await ventasRango(rango, atras);
  const unidad: "mxn" | "numero" = c.metrica === "ventas" || c.metrica === "unidades" || c.metrica === "conteo" ? "numero" : "mxn";
  const fechaDe = (v: VentaFila) => v.settled_at && v.settled_at > v.created_at ? v.settled_at : v.created_at;

  const gananciaDe = (v: VentaFila) =>
    (v.sale_items ?? []).reduce((s, it) => s + (it.unit_price_cents - (it.products?.cost_cents ?? 0)) * it.qty, 0);
  const unidadesDe = (v: VentaFila) => (v.sale_items ?? []).reduce((s, it) => s + it.qty, 0);

  if (c.agrupar === "ninguno") {
    const ingresos = ventas.reduce((s, v) => s + v.total_cents, 0);
    const valor =
      c.metrica === "ingresos" || c.metrica === "monto" ? pesos(ingresos)
      : c.metrica === "ventas" || c.metrica === "conteo" ? ventas.length
      : c.metrica === "unidades" ? ventas.reduce((s, v) => s + unidadesDe(v), 0)
      : c.metrica === "ticket" ? (ventas.length ? pesos(ingresos / ventas.length) : 0)
      : pesos(ventas.reduce((s, v) => s + gananciaDe(v), 0)); // ganancia
    return { unidad, valor };
  }

  // dimensiones por VENTA (dia, semana, metodo, vendedor) vs por LINEA (producto, categoria, etiqueta)
  const porLinea = c.agrupar === "producto" || c.agrupar === "categoria" || c.agrupar === "etiqueta";
  const vendedores = c.agrupar === "vendedor"
    ? await nombresVendedores([...new Set(ventas.map((v) => v.sold_by).filter((x): x is string => !!x))])
    : new Map<string, string>();

  const acum = new Map<string, { monto: number; ganancia: number; unidades: number; ventas: Set<string>; orden: string }>();
  const suma = (k: string, orden: string, monto: number, ganancia: number, unidades: number, ventaId: string) => {
    const e = acum.get(k) ?? { monto: 0, ganancia: 0, unidades: 0, ventas: new Set<string>(), orden };
    e.monto += monto; e.ganancia += ganancia; e.unidades += unidades; e.ventas.add(ventaId);
    if (orden < e.orden) e.orden = orden;
    acum.set(k, e);
  };

  for (const v of ventas) {
    const fecha = fechaDe(v);
    if (porLinea) {
      for (const it of v.sale_items ?? []) {
        const k = c.agrupar === "producto" ? (it.products?.name ?? "(sin producto)")
          : c.agrupar === "categoria" ? (it.products?.category ?? "(sin categoría)")
          : (it.products?.etiqueta ?? "(sin etiqueta)");
        suma(k, diaISO(fecha), it.unit_price_cents * it.qty, (it.unit_price_cents - (it.products?.cost_cents ?? 0)) * it.qty, it.qty, v.id);
      }
    } else {
      const k = c.agrupar === "dia" ? diaMX(fecha)
        : c.agrupar === "semana" ? semanaMX(fecha)
        : c.agrupar === "metodo" ? (METODO_LABEL[v.payment_method ?? ""] ?? v.payment_method ?? "(sin método)")
        : c.agrupar === "vendedor" ? (vendedores.get(v.sold_by ?? "") ?? "(sin vendedor)")
        : "(otro)";
      suma(k, diaISO(fecha), v.total_cents, gananciaDe(v), unidadesDe(v), v.id);
    }
  }

  const valorDe = (e: { monto: number; ganancia: number; unidades: number; ventas: Set<string> }) =>
    c.metrica === "ingresos" || c.metrica === "monto" ? pesos(e.monto)
    : c.metrica === "ventas" || c.metrica === "conteo" ? e.ventas.size
    : c.metrica === "unidades" ? e.unidades
    : c.metrica === "ticket" ? pesos(e.monto / Math.max(1, e.ventas.size))
    : pesos(e.ganancia);

  let serie = [...acum.entries()].map(([etiqueta, e]) => ({ etiqueta, valor: valorDe(e), orden: e.orden }));
  const esFecha = c.agrupar === "dia" || c.agrupar === "semana";
  serie = esFecha
    ? serie.sort((a, b) => a.orden.localeCompare(b.orden))
    : serie.sort((a, b) => b.valor - a.valor).slice(0, c.limite ?? 10);
  return { unidad, serie: serie.map(({ etiqueta, valor }) => ({ etiqueta, valor })) };
}

async function consultaFiados(c: ConsultaDSL): Promise<ResultadoConsulta> {
  // saldo vivo: prestamos con status pending; el cliente vive en la nota y los
  // abonos en sale_pagos — mismo criterio que fiadosPendientes de analytics
  const { data } = await DB.from("sales")
    .select("id, total_cents, note, created_at, sale_pagos(monto_cents)")
    .eq("status", "pending");
  type F = { id: string; total_cents: number; note: string | null; created_at: string; sale_pagos: { monto_cents: number }[] | null };
  const filas = ((data ?? []) as unknown as F[])
    .map((f) => ({ ...f, saldo: Math.max(0, f.total_cents - (f.sale_pagos ?? []).reduce((s, x) => s + x.monto_cents, 0)) }))
    .filter((f) => f.saldo > 0);
  if (c.agrupar === "cliente") {
    const m = new Map<string, number>();
    for (const f of filas) m.set(f.note ?? "(sin nota)", (m.get(f.note ?? "(sin nota)") ?? 0) + f.saldo);
    const serie = [...m.entries()].map(([etiqueta, v]) => ({ etiqueta, valor: pesos(v) })).sort((a, b) => b.valor - a.valor).slice(0, c.limite ?? 10);
    return { unidad: "mxn", serie };
  }
  if (c.metrica === "conteo" || c.metrica === "ventas") return { unidad: "numero", valor: filas.length };
  return { unidad: "mxn", valor: pesos(filas.reduce((s, f) => s + f.saldo, 0)) };
}

async function consultaGastos(c: ConsultaDSL, rango: Rango, atras: number): Promise<ResultadoConsulta> {
  const { desde, hasta } = ventana(rango, atras);
  const { data } = await DB.from("gastos").select("monto_cents, metodo, concepto, created_at").gte("created_at", desde).lt("created_at", hasta);
  type G = { monto_cents: number; metodo: string; concepto: string | null; created_at: string };
  const filas = (data ?? []) as G[];
  if (c.agrupar === "ninguno") {
    return c.metrica === "conteo"
      ? { unidad: "numero", valor: filas.length }
      : { unidad: "mxn", valor: pesos(filas.reduce((s, g) => s + g.monto_cents, 0)) };
  }
  const llave = (g: G) =>
    c.agrupar === "dia" ? diaMX(g.created_at)
    : c.agrupar === "semana" ? semanaMX(g.created_at)
    : c.agrupar === "metodo" ? (METODO_LABEL[g.metodo] ?? g.metodo)
    : (g.concepto ?? "(sin concepto)");
  const m = new Map<string, { v: number; orden: string }>();
  for (const g of filas) {
    const k = llave(g);
    const e = m.get(k) ?? { v: 0, orden: diaISO(g.created_at) };
    e.v += g.monto_cents;
    if (diaISO(g.created_at) < e.orden) e.orden = diaISO(g.created_at);
    m.set(k, e);
  }
  const esFecha = c.agrupar === "dia" || c.agrupar === "semana";
  let serie = [...m.entries()].map(([etiqueta, e]) => ({ etiqueta, valor: pesos(e.v), orden: e.orden }));
  serie = esFecha ? serie.sort((a, b) => a.orden.localeCompare(b.orden)) : serie.sort((a, b) => b.valor - a.valor).slice(0, c.limite ?? 10);
  return { unidad: "mxn", serie: serie.map(({ etiqueta, valor }) => ({ etiqueta, valor })) };
}

async function consultaCotizaciones(c: ConsultaDSL, rango: Rango): Promise<ResultadoConsulta> {
  const { desde, hasta } = ventana(rango);
  const { data } = await DB.from("cotizaciones").select("id, estado, total_cents, created_at").gte("created_at", desde).lt("created_at", hasta);
  type Q = { estado: string; total_cents: number | null };
  const filas = (data ?? []) as Q[];
  if (c.agrupar === "estado") {
    const m = new Map<string, number>();
    for (const q of filas) m.set(q.estado, (m.get(q.estado) ?? 0) + 1);
    return { unidad: "numero", serie: [...m.entries()].map(([etiqueta, valor]) => ({ etiqueta, valor })).sort((a, b) => b.valor - a.valor) };
  }
  if (c.metrica === "monto" || c.metrica === "ingresos") return { unidad: "mxn", valor: pesos(filas.reduce((s, q) => s + (q.total_cents ?? 0), 0)) };
  return { unidad: "numero", valor: filas.length };
}

export async function ejecutarConsulta(c: ConsultaDSL, rangoDashboard: Rango, costosVer: boolean): Promise<ResultadoConsulta> {
  const rango = (c.rango ?? rangoDashboard) as Rango;
  const corre = (atras = 0) =>
    c.fuente === "ventas" ? consultaVentas(c, rango, atras, costosVer)
    : c.fuente === "fiados" ? consultaFiados(c)
    : c.fuente === "gastos" ? consultaGastos(c, rango, atras)
    : consultaCotizaciones(c, rango);
  const actual = await corre(0);
  if (c.comparar === "periodo_anterior" && actual.valor != null && (c.fuente === "ventas" || c.fuente === "gastos")) {
    const anterior = await corre(1);
    actual.delta = anterior.valor ? (actual.valor - anterior.valor) / anterior.valor : null;
  }
  return actual;
}
