import { auth } from "@clerk/nextjs/server";
import { getProfile, requirePagePermiso } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { mxHoy, rangoUTC } from "@/lib/caja-range";
import {
  CajaView,
  type Gasto,
  type Ingreso,
  type Devolucion,
  type IngresoLinea,
  type PorCuenta,
} from "@/modules/caja/CajaView";
import type { PaymentMethodStored, PaymentMethod, PaymentMethodVenta } from "@/lib/types";


// 'saldo' is here so it has a column of its own, not so it counts as money.
// The cash came in on the day of the original sale; a sale paid with credit is
// the shop settling a debt it already owed. efectivoCaja only reads .efectivo,
// so it stays out of the drawer either way — this just stops it being silently
// filed under "otro".
const METODOS: PaymentMethodVenta[] = ["efectivo", "tarjeta", "transferencia", "otro", "saldo"];
const cero = () =>
  Object.fromEntries(METODOS.map((m) => [m, 0])) as Record<PaymentMethodVenta, number>;

type VentaRow = {
  id?: string;
  sold_by?: string | null;
  total_cents: number;
  payment_method: PaymentMethodStored | null;
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
      inventory_id: string | null;
    } | null;
  }[];
};

type DevolRow = {
  devolucion_items: {
    qty: number;
    unit_price_cents: number;
    // What these specific pieces cost, resolved FIFO at sale time. NULL on
    // sales made before cost layers existed.
    costo_total_cents?: number | null;
    products: { cost_cents: number } | null;
  }[];
};

export default async function CajaPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; sucursal?: string }>;
}) {
  const sp = await searchParams;
  const from = sp.from ?? mxHoy();
  const to = sp.to ?? from;
  const { startISO, endISO } = rangoUTC(from, to);

  await requirePagePermiso("corte_ver");
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
        "id, total_cents, payment_method, created_at, sold_by, sale_items(qty, unit_price_cents, costo_total_cents, products(etiqueta, cost_cents, name, sku, inventory_id))",
      )
      .eq("status", "completed")
      .is("settled_at", null)
      .gte("created_at", startISO)
      .lt("created_at", endISO),
    // Credit notes completed in range — ONLY for the sales count. All their
    // money (cash, tags, profit, inventory split) comes from sale_pagos,
    // prorated per abono.
    insforge.database
      .from("sales")
      .select("id, sold_by, settled_at")
      .eq("status", "completed")
      .gte("settled_at", startISO)
      .lt("settled_at", endISO),
    insforge.database
      .from("gastos")
      .select("id, concepto, monto_cents, metodo, categoria, created_at, created_by")
      .gte("created_at", startISO)
      .lt("created_at", endISO)
      .order("created_at", { ascending: false }),
    insforge.database
      .from("ingresos")
      .select("id, concepto, monto_cents, metodo, categoria, created_at, created_by")
      .gte("created_at", startISO)
      .lt("created_at", endISO)
      .order("created_at", { ascending: false }),
    insforge.database
      .from("devoluciones")
      .select(
        "id, monto_cents, metodo, motivo, created_at, created_by, devolucion_items(qty, unit_price_cents, products(cost_cents))",
      )
      .gte("created_at", startISO)
      .lt("created_at", endISO)
      .order("created_at", { ascending: false }),
    insforge.database
      .from("sale_pagos")
      .select(
        "sale_id, monto_cents, metodo, created_at, created_by, sales(customer_name, total_cents, sale_items(qty, unit_price_cents, costo_total_cents, products(etiqueta, cost_cents, name, sku, inventory_id)))",
      )
      .gte("created_at", startISO)
      .lt("created_at", endISO),
    insforge.database
      .from("adelanto_pagos")
      .select(
        "adelanto_id, monto_cents, metodo, tipo, created_at, created_by, adelantos(cliente, descripcion, qty, products(name))",
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
  const { data: inventoriesData } = await insforge.database
    .from("inventories")
    .select("id, name");
  const invName = new Map(
    ((inventoriesData ?? []) as { id: string; name: string }[]).map((i) => [i.id, i.name]),
  );

  let directasV = (directas ?? []) as unknown as VentaRow[];
  let fiadosComp2 = (fiadosComp ?? []) as { id: string; sold_by: string | null; settled_at: string }[];
  let gastos = (gastosData ?? []) as Gasto[];
  let ingresos = (ingresosData ?? []) as Ingreso[];
  let devoluciones = (devolucionesData ?? []) as Devolucion[];
  let salePagos = (salePagosData ?? []) as unknown as {
    sale_id: string;
    created_by: string | null;
    monto_cents: number;
    // A split sale can settle part of itself with store credit.
    metodo: PaymentMethodVenta;
    created_at: string;
    sales: {
      customer_name: string | null;
      total_cents: number;
      sale_items: VentaRow["sale_items"];
    } | null;
  }[];
  let adelantoPagos = (adelantoPagosData ?? []) as unknown as {
    adelanto_id: string;
    created_by: string | null;
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
  let adelantosEnt = (adelantosEntData ?? []) as unknown as {
    precio_cents: number;
    qty: number;
    products: { cost_cents: number } | null;
  }[];

  // --- Sucursal attribution: every cash event belongs to the branch where
  // its REGISTRAR checked in that day. Derived, not stored — the check-in is
  // already the audit of where each person physically was. Events by people
  // with no check-in that day (admins, unassigned) fall into "Sin sucursal".
  const { data: sucsData } = await insforgeAdmin.database
    .from("sucursales")
    .select("id, nombre")
    .eq("is_active", true)
    .order("nombre");
  const sucursalesActivas = (sucsData ?? []) as { id: string; nombre: string }[];
  const sucursalSel = sucursalesActivas.length > 0 ? (sp.sucursal ?? null) : null;

  const mxDia = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date(iso));
  const { data: chkData } = await insforgeAdmin.database
    .from("checkins")
    .select("profile_id, sucursal_id, created_at")
    .gte("created_at", startISO)
    .lt("created_at", endISO);
  const checkinDe = new Map<string, string>();
  for (const c of (chkData ?? []) as { profile_id: string; sucursal_id: string; created_at: string }[]) {
    const key = `${c.profile_id}|${mxDia(c.created_at)}`;
    if (!checkinDe.has(key)) checkinDe.set(key, c.sucursal_id);
  }
  const sucursalDe = (quien: string | null | undefined, cuandoISO: string | null | undefined) =>
    quien && cuandoISO ? checkinDe.get(`${quien}|${mxDia(cuandoISO)}`) ?? null : null;
  const enSucursal = (quien: string | null | undefined, cuandoISO: string | null | undefined) =>
    sucursalSel === null ||
    (sucursalSel === "sin" ? sucursalDe(quien, cuandoISO) === null : sucursalDe(quien, cuandoISO) === sucursalSel);

  // Global summary (computed BEFORE filtering): income per branch.
  const porSucursalMapa = new Map<string, number>();
  const sumarSucursal = (quien: string | null | undefined, cuandoISO: string | null | undefined, cents: number) => {
    const key = sucursalDe(quien, cuandoISO) ?? "sin";
    porSucursalMapa.set(key, (porSucursalMapa.get(key) ?? 0) + cents);
  };
  if (sucursalesActivas.length > 0) {
    for (const v of directasV) if (v.payment_method !== "mixto") sumarSucursal(v.sold_by, v.created_at, v.total_cents);
    for (const pg of salePagos) sumarSucursal(pg.created_by, pg.created_at, pg.monto_cents);
    for (const pg of adelantoPagos) if (pg.tipo === "abono") sumarSucursal(pg.created_by, pg.created_at, pg.monto_cents);
    for (const ing of ingresos) sumarSucursal((ing as { created_by?: string | null }).created_by, ing.created_at, ing.monto_cents);
  }
  const porSucursal = sucursalesActivas
    .map((su) => ({ id: su.id, nombre: su.nombre, ingresos: porSucursalMapa.get(su.id) ?? 0 }))
    .concat(
      porSucursalMapa.has("sin")
        ? [{ id: "sin", nombre: "Sin sucursal", ingresos: porSucursalMapa.get("sin")! }]
        : [],
    );

  // Branch view: drop every event that didn't happen at the selected counter.
  // All the aggregation below (methods, tags, profit, inventories, detail)
  // then reads as that branch's own corte.
  if (sucursalSel) {
    directasV = directasV.filter((v) => enSucursal(v.sold_by, v.created_at));
    salePagos = salePagos.filter((pg) => enSucursal(pg.created_by, pg.created_at));
    adelantoPagos = adelantoPagos.filter((pg) => enSucursal(pg.created_by, pg.created_at));
    gastos = gastos.filter((g) => enSucursal((g as { created_by?: string | null }).created_by, g.created_at));
    ingresos = ingresos.filter((g) => enSucursal((g as { created_by?: string | null }).created_by, g.created_at));
    devoluciones = devoluciones.filter((d) => enSucursal((d as { created_by?: string | null }).created_by, d.created_at));
    fiadosComp2 = fiadosComp2.filter((f) => enSucursal(f.sold_by, f.settled_at));
    // Adelantos delivered (profit-on-delivery) carry no per-branch registrar;
    // they count only in the global corte.
    adelantosEnt = [];
  }

  // --- Income (cash in by day/method) ---
  const ingresosPorMetodo = cero();
  let ingresosTotal = 0;
  const addIngreso = (m: PaymentMethodVenta, c: number) => {
    ingresosPorMetodo[m] += c;
    ingresosTotal += c;
  };
  // Adelanto abonos are a subset of income, tracked per method too so the corte
  // can show them separately (they're already folded into ingresosPorMetodo).
  const adelantosPorMetodo = cero();
  // A 'mixto' sale was settled with more than one method, so its money is in
  // sale_pagos (summed just below). Counting its total here too would double it.
  for (const v of directasV) {
    if (v.payment_method === "mixto") continue;
    addIngreso(v.payment_method ?? "otro", v.total_cents);
  }
  for (const p of salePagos) addIngreso(p.metodo, p.monto_cents);
  for (const p of adelantoPagos)
    if (p.tipo === "abono") {
      addIngreso(p.metodo, p.monto_cents);
      adelantosPorMetodo[p.metodo] += p.monto_cents;
    }
  for (const i of ingresos) addIngreso(i.metodo, i.monto_cents);

  // --- Tagged revenue (recognized at completion), broken down per product ---
  type TagAgg = {
    monto: number;
    productos: Map<string, { nombre: string; sku: string; qty: number; monto: number }>;
  };
  const etiquetadoMap: Record<string, TagAgg> = {};
  // `factor` prorates a credit note's items by the day's abono (abono/total) so
  // the tag money matches the cash that actually came in today — counting the
  // whole note at completion made the caja descuadrar whenever a note was paid
  // across days.
  const tagRev = (rows: VentaRow[], factor = 1) => {
    for (const v of rows)
      for (const it of v.sale_items ?? []) {
        const t = it.products?.etiqueta;
        if (!t) continue;
        const monto = Math.round(it.unit_price_cents * it.qty * factor);
        const agg = (etiquetadoMap[t] ??= { monto: 0, productos: new Map() });
        agg.monto += monto;
        const sku = it.products?.sku ?? "—";
        const p = agg.productos.get(sku) ?? {
          nombre: it.products?.name ?? "—",
          sku,
          qty: 0,
          monto: 0,
        };
        p.qty += it.qty * factor;
        p.monto += monto;
        agg.productos.set(sku, p);
      }
  };
  tagRev(directasV);
  const etiquetadoOut = () =>
    Object.entries(etiquetadoMap)
      .map(([tag, a]) => ({
        tag,
        monto: a.monto,
        productos: [...a.productos.values()]
          // Keep prorated fractions visible (2 decimals kills float noise):
          // the UI renders a fractional qty as "abono parcial", not "0×".
          .map((p) => ({ ...p, qty: Math.round(p.qty * 100) / 100 }))
          .sort((x, y) => y.monto - x.monto),
      }))
      .sort((a, b) => b.monto - a.monto);

  // --- Net profit (admin): cash basis — direct sales in full, credit notes
  // prorated by each day's abonos — less returns ---
  let gananciaVentas = 0;
  // Cost comes from the layers the sale actually consumed (FIFO). Sales made
  // before layers existed have none, so they fall back to the catalog cost —
  // which is what the whole corte used to do.
  const costoLinea = (it: {
    qty: number;
    costo_total_cents?: number | null;
    products: { cost_cents: number } | null;
  }) => it.costo_total_cents ?? (it.products?.cost_cents ?? 0) * it.qty;

  const margen = (rows: VentaRow[], factor = 1) => {
    for (const v of rows)
      for (const it of v.sale_items ?? [])
        gananciaVentas += Math.round(
          (it.unit_price_cents * it.qty - costoLinea(it)) * factor,
        );
  };
  margen(directasV);
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

  // --- Corte por inventario: revenue + margin attributed to each inventory via
  // sale_items -> product -> inventory. Cash basis: direct sales in full, credit
  // notes prorated by the day's abonos. Non-product cash (extra income, gastos)
  // isn't inventory-specific, so it stays out of this split by design.
  type InvMov = {
    fecha: string;
    producto: string;
    sku: string;
    qty: number;
    costoCents: number; // unit cost to us
    precioCents: number; // unit price it sold at
  };
  type InvAgg = {
    inventoryId: string;
    nombre: string;
    unidades: number;
    ventaCents: number;
    gananciaCents: number;
    movimientos: InvMov[];
  };
  const porInvMap = new Map<string, InvAgg>();
  const acumInv = (rows: VentaRow[], factor = 1) => {
    for (const v of rows)
      for (const it of v.sale_items ?? []) {
        const invId = it.products?.inventory_id ?? "sin";
        const nombre = it.products?.inventory_id
          ? invName.get(it.products.inventory_id) ?? "Otro inventario"
          : "Sin inventario";
        const a =
          porInvMap.get(invId) ??
          {
            inventoryId: invId,
            nombre,
            unidades: 0,
            ventaCents: 0,
            gananciaCents: 0,
            movimientos: [] as InvMov[],
          };
        a.unidades += it.qty * factor;
        a.ventaCents += Math.round(it.unit_price_cents * it.qty * factor);
        a.gananciaCents += Math.round(
          (it.unit_price_cents - (it.products?.cost_cents ?? 0)) * it.qty * factor,
        );
        a.movimientos.push({
          // Prorated lines carry the scaled unit money so qty × precio matches
          // the cash attributed today; the name flags it as an abono.
          fecha: v.created_at ?? v.settled_at ?? "",
          producto: (it.products?.name ?? "—") + (factor < 1 ? " · abono" : ""),
          sku: it.products?.sku ?? "—",
          qty: it.qty,
          costoCents: Math.round((it.products?.cost_cents ?? 0) * factor),
          precioCents: Math.round(it.unit_price_cents * factor),
        });
        porInvMap.set(invId, a);
      }
  };
  acumInv(directasV);

  // Credit-note items, prorated by the day's abonos (cash basis). Each abono
  // contributes abono/total of the note's items to the tag, profit and
  // inventory splits — so every section sums to the cash that actually entered
  // today, and across days the note adds up to its full value.
  for (const p of salePagos) {
    const s = p.sales;
    if (!s || !s.total_cents || s.total_cents <= 0) continue;
    const factor = p.monto_cents / s.total_cents;
    const row = {
      total_cents: p.monto_cents,
      payment_method: p.metodo,
      created_at: p.created_at,
      sale_items: s.sale_items ?? [],
    } as VentaRow;
    tagRev([row], factor);
    margen([row], factor);
    acumInv([row], factor);
  }

  const etiquetado = etiquetadoOut();
  const porInventario = [...porInvMap.values()]
    .map((a) => ({
      ...a,
      unidades: Math.round(a.unidades),
      movimientos: a.movimientos.sort((x, y) => (x.fecha < y.fecha ? 1 : -1)),
    }))
    .sort((a, b) => b.ventaCents - a.ventaCents);

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

  const ventasCount = directasV.length + fiadosComp2.length;

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
        : prodList(p.sales?.sale_items) || "Nota de crédito",
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

  // --- Transfers split per business account, via the comprobantes ---
  // The account was captured on the proof, not on the payment row, so this is
  // an attribution: each transfer event looks up its owner's tagged proof
  // (sale, adelanto, or the web order that produced the sale). Events whose
  // owner has no tagged proof land in "sin cuenta" — the split always sums to
  // the Transferencia income line.
  const transDirectas = directasV.filter((v) => v.payment_method === "transferencia");
  const transAbonos = salePagos.filter((p) => p.metodo === "transferencia");
  const transAdel = adelantoPagos.filter(
    (p) => p.tipo === "abono" && p.metodo === "transferencia",
  );
  const transExtra = ingresos.filter((i) => i.metodo === "transferencia");
  let porCuenta: PorCuenta[] = [];
  const hayTransfers =
    transDirectas.length + transAbonos.length + transAdel.length + transExtra.length > 0;
  if (hayTransfers) {
    const saleIds = [
      ...new Set([...transDirectas.map((v) => v.id), ...transAbonos.map((p) => p.sale_id)]),
    ].filter(Boolean) as string[];
    const adelIds = [...new Set(transAdel.map((p) => p.adelanto_id))];

    const [{ data: ordenesData }, { data: compData }] = await Promise.all([
      saleIds.length
        ? insforgeAdmin.database.from("ordenes_web").select("id, sale_id").in("sale_id", saleIds)
        : Promise.resolve({ data: [] }),
      insforgeAdmin.database
        .from("comprobantes_pago")
        .select("sale_id, adelanto_id, orden_id, cuenta_id, cuentas_negocio(id, banco, alias)")
        .not("cuenta_id", "is", null),
    ]);
    const ordenDeSale = new Map(
      ((ordenesData ?? []) as { id: string; sale_id: string | null }[])
        .filter((o) => o.sale_id)
        .map((o) => [o.sale_id as string, o.id]),
    );
    type CuentaRow = { id: string; banco: string; alias: string };
    const comps = ((compData ?? []) as unknown as {
      sale_id: string | null;
      adelanto_id: string | null;
      orden_id: string | null;
      cuentas_negocio: CuentaRow | CuentaRow[] | null;
    }[]).map((c) => ({
      ...c,
      cuenta: Array.isArray(c.cuentas_negocio) ? c.cuentas_negocio[0] ?? null : c.cuentas_negocio,
    }));
    const cuentaDe = new Map<string, CuentaRow>();
    for (const c of comps) {
      if (!c.cuenta) continue;
      if (c.sale_id) cuentaDe.set(`s:${c.sale_id}`, c.cuenta);
      if (c.adelanto_id) cuentaDe.set(`a:${c.adelanto_id}`, c.cuenta);
      if (c.orden_id) cuentaDe.set(`o:${c.orden_id}`, c.cuenta);
    }
    const buscarVenta = (saleId: string | undefined | null): CuentaRow | null => {
      if (!saleId) return null;
      const directa = cuentaDe.get(`s:${saleId}`);
      if (directa) return directa;
      const ordenId = ordenDeSale.get(saleId);
      return ordenId ? cuentaDe.get(`o:${ordenId}`) ?? null : null;
    };

    const agg = new Map<string, PorCuenta>();
    const sumar = (cuenta: CuentaRow | null, monto: number) => {
      const key = cuenta?.id ?? "—";
      const a = agg.get(key) ?? { cuenta, monto: 0 };
      a.monto += monto;
      agg.set(key, a);
    };
    for (const v of transDirectas) sumar(buscarVenta(v.id), v.total_cents);
    for (const p of transAbonos) sumar(buscarVenta(p.sale_id), p.monto_cents);
    for (const p of transAdel) sumar(cuentaDe.get(`a:${p.adelanto_id}`) ?? null, p.monto_cents);
    for (const i of transExtra) sumar(null, i.monto_cents);
    // "Sin cuenta" always last; accounts by amount.
    porCuenta = [...agg.values()].sort((x, y) =>
      !x.cuenta ? 1 : !y.cuenta ? -1 : y.monto - x.monto,
    );
    // A split with ONLY "sin cuenta" says nothing — hide it until the shop
    // starts tagging (or has accounts at all).
    if (porCuenta.length === 1 && !porCuenta[0].cuenta) porCuenta = [];
  }

  return (
    <CajaView
      data={{
        from,
        to,
        isAdmin,
        ventasCount,
        ingresosPorMetodo,
        adelantosPorMetodo,
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
        porInventario,
        porCuenta,
        sucursales: sucursalesActivas,
        sucursalSel,
        porSucursal,
      }}
    />
  );
}
