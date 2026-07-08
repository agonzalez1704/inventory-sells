import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { mxHoy, rangoUTC } from "@/lib/caja-range";
import {
  CajaView,
  type Gasto,
  type Ingreso,
  type Devolucion,
  type IngresoLinea,
} from "@/modules/caja/CajaView";
import type { PaymentMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

const METODOS: PaymentMethod[] = ["efectivo", "tarjeta", "transferencia", "otro"];
const cero = () =>
  Object.fromEntries(METODOS.map((m) => [m, 0])) as Record<PaymentMethod, number>;

type VentaRow = {
  id?: string;
  total_cents: number;
  payment_method: PaymentMethod | null;
  created_at?: string;
  settled_at?: string;
  sale_items: {
    qty: number;
    unit_price_cents: number;
    products: {
      etiqueta: string | null;
      cost_cents: number;
      name: string;
      sku: string;
    } | null;
  }[];
};

type DevolRow = {
  devolucion_items: {
    qty: number;
    unit_price_cents: number;
    products: { cost_cents: number } | null;
  }[];
};

export default async function CajaPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const from = sp.from ?? mxHoy();
  const to = sp.to ?? from;
  const { startISO, endISO } = rangoUTC(from, to);

  const { userId } = await auth();
  const profile = userId ? await getProfile(userId) : null;
  const isAdmin = profile?.role === "admin";

  const insforge = await createInsForgeServerClient();

  // Cash is attributed to the DAY it enters, by method:
  // - direct sales: their full total at created_at (paid at register);
  // - fiados: their abonos (sale_pagos) — partial or full — by abono date;
  // - adelantos: their abonos (adelanto_pagos, abono) by abono date.
  // Profit is recognized at completion/delivery, not per abono.
  const [
    { data: directas },
    { data: fiadosComp },
    { data: gastosData },
    { data: ingresosData },
    { data: devolucionesData },
    { data: salePagosData },
    { data: adelantoPagosData },
    { data: adelantosEntData },
  ] = await Promise.all([
    insforge.database
      .from("sales")
      .select(
        "id, total_cents, payment_method, created_at, sale_items(qty, unit_price_cents, products(etiqueta, cost_cents, name, sku))",
      )
      .eq("status", "completed")
      .is("settled_at", null)
      .gte("created_at", startISO)
      .lt("created_at", endISO),
    // Fiados completed in range — for profit/tagged revenue only (cash comes
    // from sale_pagos, not from re-counting the total here).
    insforge.database
      .from("sales")
      .select(
        "id, total_cents, payment_method, settled_at, sale_items(qty, unit_price_cents, products(etiqueta, cost_cents, name, sku))",
      )
      .eq("status", "completed")
      .gte("settled_at", startISO)
      .lt("settled_at", endISO),
    insforge.database
      .from("gastos")
      .select("id, concepto, monto_cents, metodo, categoria, created_at")
      .gte("created_at", startISO)
      .lt("created_at", endISO)
      .order("created_at", { ascending: false }),
    insforge.database
      .from("ingresos")
      .select("id, concepto, monto_cents, metodo, categoria, created_at")
      .gte("created_at", startISO)
      .lt("created_at", endISO)
      .order("created_at", { ascending: false }),
    insforge.database
      .from("devoluciones")
      .select(
        "id, monto_cents, metodo, motivo, created_at, devolucion_items(qty, unit_price_cents, products(cost_cents))",
      )
      .gte("created_at", startISO)
      .lt("created_at", endISO)
      .order("created_at", { ascending: false }),
    insforge.database
      .from("sale_pagos")
      .select(
        "monto_cents, metodo, created_at, sales(customer_name, sale_items(qty, products(name)))",
      )
      .gte("created_at", startISO)
      .lt("created_at", endISO),
    insforge.database
      .from("adelanto_pagos")
      .select(
        "monto_cents, metodo, tipo, created_at, adelantos(cliente, descripcion, qty, products(name))",
      )
      .gte("created_at", startISO)
      .lt("created_at", endISO),
    insforge.database
      .from("adelantos")
      .select("precio_cents, qty, products(cost_cents)")
      .eq("estado", "entregado")
      .gte("entregado_at", startISO)
      .lt("entregado_at", endISO),
  ]);

  const directasV = (directas ?? []) as unknown as VentaRow[];
  const fiadosV = (fiadosComp ?? []) as unknown as VentaRow[];
  const gastos = (gastosData ?? []) as Gasto[];
  const ingresos = (ingresosData ?? []) as Ingreso[];
  const devoluciones = (devolucionesData ?? []) as Devolucion[];
  const salePagos = (salePagosData ?? []) as unknown as {
    monto_cents: number;
    metodo: PaymentMethod;
    created_at: string;
    sales: {
      customer_name: string | null;
      sale_items: { qty: number; products: { name: string } | null }[];
    } | null;
  }[];
  const adelantoPagos = (adelantoPagosData ?? []) as unknown as {
    monto_cents: number;
    metodo: PaymentMethod;
    tipo: "abono" | "devolucion";
    created_at: string;
    adelantos: {
      cliente: string | null;
      descripcion: string | null;
      qty: number;
      products: { name: string } | null;
    } | null;
  }[];
  const adelantosEnt = (adelantosEntData ?? []) as unknown as {
    precio_cents: number;
    qty: number;
    products: { cost_cents: number } | null;
  }[];

  // --- Income (cash in by day/method) ---
  const ingresosPorMetodo = cero();
  let ingresosTotal = 0;
  const addIngreso = (m: PaymentMethod, c: number) => {
    ingresosPorMetodo[m] += c;
    ingresosTotal += c;
  };
  for (const v of directasV) addIngreso(v.payment_method ?? "otro", v.total_cents);
  for (const p of salePagos) addIngreso(p.metodo, p.monto_cents);
  for (const p of adelantoPagos) if (p.tipo === "abono") addIngreso(p.metodo, p.monto_cents);
  for (const i of ingresos) addIngreso(i.metodo, i.monto_cents);

  // --- Tagged revenue (recognized at completion), broken down per product ---
  type TagAgg = {
    monto: number;
    productos: Map<string, { nombre: string; sku: string; qty: number; monto: number }>;
  };
  const etiquetadoMap: Record<string, TagAgg> = {};
  const tagRev = (rows: VentaRow[]) => {
    for (const v of rows)
      for (const it of v.sale_items ?? []) {
        const t = it.products?.etiqueta;
        if (!t) continue;
        const monto = it.unit_price_cents * it.qty;
        const agg = (etiquetadoMap[t] ??= { monto: 0, productos: new Map() });
        agg.monto += monto;
        const sku = it.products?.sku ?? "—";
        const p = agg.productos.get(sku) ?? {
          nombre: it.products?.name ?? "—",
          sku,
          qty: 0,
          monto: 0,
        };
        p.qty += it.qty;
        p.monto += monto;
        agg.productos.set(sku, p);
      }
  };
  tagRev(directasV);
  tagRev(fiadosV);
  const etiquetado = Object.entries(etiquetadoMap)
    .map(([tag, a]) => ({
      tag,
      monto: a.monto,
      productos: [...a.productos.values()].sort((x, y) => y.monto - x.monto),
    }))
    .sort((a, b) => b.monto - a.monto);

  // --- Net profit (admin): margin at completion/delivery, less returns ---
  let gananciaVentas = 0;
  const margen = (rows: VentaRow[]) => {
    for (const v of rows)
      for (const it of v.sale_items ?? [])
        gananciaVentas += (it.unit_price_cents - (it.products?.cost_cents ?? 0)) * it.qty;
  };
  margen(directasV);
  margen(fiadosV);
  for (const a of adelantosEnt) {
    gananciaVentas += a.precio_cents - (a.products?.cost_cents ?? 0) * a.qty;
  }
  let gananciaDevuelta = 0;
  for (const d of (devolucionesData ?? []) as unknown as DevolRow[]) {
    for (const it of d.devolucion_items ?? []) {
      gananciaDevuelta += (it.unit_price_cents - (it.products?.cost_cents ?? 0)) * it.qty;
    }
  }
  const ganancia = isAdmin ? gananciaVentas - gananciaDevuelta : null;

  const gastosPorMetodo = cero();
  let gastosTotal = 0;
  for (const g of gastos) {
    gastosPorMetodo[g.metodo] += g.monto_cents;
    gastosTotal += g.monto_cents;
  }

  // --- Cash out (by day/method): sale returns + adelanto refunds ---
  const devolucionesPorMetodo = cero();
  let devolucionesTotal = 0;
  for (const d of devoluciones) {
    devolucionesPorMetodo[d.metodo] += d.monto_cents;
    devolucionesTotal += d.monto_cents;
  }
  for (const p of adelantoPagos)
    if (p.tipo === "devolucion") {
      devolucionesPorMetodo[p.metodo] += p.monto_cents;
      devolucionesTotal += p.monto_cents;
    }

  const ventasCount = directasV.length + fiadosV.length;

  // Breakdown of the Ingresos KPI: every cash-in event, so the lines sum to
  // ingresosTotal exactly. Same four sources as the KPI — direct sales, abonos a
  // fiados, abonos a adelantos, ingresos extra. Fiado *totals* are NOT listed:
  // their cash is the abonos (counting both would double them).
  const prodList = (
    items: { qty: number; products: { name: string } | null }[] | undefined,
  ) =>
    (items ?? [])
      .map((it) => `${it.qty > 1 ? `${it.qty}× ` : ""}${it.products?.name ?? "—"}`)
      .join(" · ");
  const ingresosDetalle: IngresoLinea[] = [
    ...directasV.map((v, i) => ({
      id: v.id ?? `venta-${i}`,
      tipo: "venta" as const,
      concepto: prodList(v.sale_items) || "Venta",
      monto_cents: v.total_cents,
      metodo: v.payment_method,
      fecha: v.created_at ?? "",
    })),
    ...salePagos.map((p, i) => ({
      id: `abono-${i}`,
      tipo: "abono" as const,
      concepto: p.sales?.customer_name?.trim()
        ? p.sales.customer_name.trim()
        : prodList(p.sales?.sale_items) || "Fiado",
      monto_cents: p.monto_cents,
      metodo: p.metodo,
      fecha: p.created_at,
    })),
    ...adelantoPagos
      .filter((p) => p.tipo === "abono")
      .map((p, i) => ({
        id: `adel-${i}`,
        tipo: "adelanto" as const,
        concepto:
          p.adelantos?.products?.name ??
          p.adelantos?.descripcion ??
          p.adelantos?.cliente ??
          "Adelanto",
        monto_cents: p.monto_cents,
        metodo: p.metodo,
        fecha: p.created_at,
      })),
    ...ingresos.map((i) => ({
      id: i.id,
      tipo: "extra" as const,
      concepto: i.concepto,
      monto_cents: i.monto_cents,
      metodo: i.metodo,
      fecha: i.created_at,
    })),
  ].sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  return (
    <CajaView
      data={{
        from,
        to,
        isAdmin,
        ventasCount,
        ingresosPorMetodo,
        gastosPorMetodo,
        devolucionesPorMetodo,
        ingresosTotal,
        gastosTotal,
        devolucionesTotal,
        gastos,
        ingresos,
        devoluciones,
        etiquetado,
        ganancia,
        ingresosDetalle,
      }}
    />
  );
}
