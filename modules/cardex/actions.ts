"use server";

import { insforgeAdmin } from "@/lib/insforge/admin";
import { assertPermiso } from "@/lib/auth/profile";

export type MovimientoCardex = {
  id: string;
  fecha: string;
  reason: string;
  delta: number;
  /** Stock right after this movement — the shelf as it stood that day. */
  saldo: number;
  titulo: string;
  detalle: string | null;
  /** Unit cost when the movement came from a purchase. */
  costo_unitario_cents: number | null;
  quien: string;
  href: string | null;
};

export type CardexProducto = {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  cost_cents: number;
  price_cents: number;
  proveedor: string | null;
};

export type CardexResumen = {
  comprado: number;
  vendido: number;
  devuelto: number;
  ajustado: number;
  /** Weighted average of what we actually paid, across purchases. */
  costoPromedioCents: number | null;
};

const TITULO: Record<string, string> = {
  purchase: "Entrada de compra",
  purchase_cancel: "Compra cancelada",
  purchase_return: "Devolución a proveedor",
  sale: "Venta",
  return: "Devolución de cliente",
  adjustment: "Ajuste manual",
  import: "Carga inicial",
  reserva: "Reserva",
};

export async function getCardex(
  productId: string,
  limite = 200,
): Promise<{
  producto: CardexProducto | null;
  movimientos: MovimientoCardex[];
  resumen: CardexResumen;
}> {
  await assertPermiso("inventario_ver");

  const { data: prod } = await insforgeAdmin.database
    .from("products")
    .select("id, sku, name, quantity, cost_cents, price_cents, proveedores(nombre)")
    .eq("id", productId)
    .maybeSingle();
  const p = prod as unknown as
    | (CardexProducto & { proveedores: { nombre: string } | null })
    | null;
  if (!p) {
    return {
      producto: null,
      movimientos: [],
      resumen: { comprado: 0, vendido: 0, devuelto: 0, ajustado: 0, costoPromedioCents: null },
    };
  }

  const { data: movData } = await insforgeAdmin.database
    .from("inventory_movements")
    .select("id, delta, reason, ref_id, note, created_by, created_at")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(limite);
  const movs = (movData ?? []) as {
    id: string;
    delta: number;
    reason: string;
    ref_id: string | null;
    note: string | null;
    created_by: string | null;
    created_at: string;
  }[];

  // Resolve the references in batches rather than per row.
  const compraIds = movs
    .filter((m) => m.reason.startsWith("purchase") && m.ref_id)
    .map((m) => m.ref_id!);
  const saleIds = movs.filter((m) => m.reason === "sale" && m.ref_id).map((m) => m.ref_id!);
  const userIds = [...new Set(movs.map((m) => m.created_by).filter(Boolean))] as string[];

  const [{ data: compras }, { data: costos }, { data: ventas }, { data: profs }] =
    await Promise.all([
      compraIds.length
        ? insforgeAdmin.database
            .from("compras")
            .select("id, folio_factura, fecha_ingreso, proveedores(nombre)")
            .in("id", compraIds)
        : Promise.resolve({ data: [] }),
      compraIds.length
        ? insforgeAdmin.database
            .from("compra_items")
            .select("compra_id, costo_unitario_cents")
            .eq("product_id", productId)
            .in("compra_id", compraIds)
        : Promise.resolve({ data: [] }),
      saleIds.length
        ? insforgeAdmin.database
            .from("sales")
            .select("id, customer_name, total_cents")
            .in("id", saleIds)
        : Promise.resolve({ data: [] }),
      userIds.length
        ? insforgeAdmin.database.from("profiles").select("id, full_name").in("id", userIds)
        : Promise.resolve({ data: [] }),
    ]);

  const compraDe = new Map(
    ((compras ?? []) as unknown as {
      id: string;
      folio_factura: string | null;
      proveedores: { nombre: string } | null;
    }[]).map((c) => [c.id, c]),
  );
  const costoDe = new Map(
    ((costos ?? []) as { compra_id: string; costo_unitario_cents: number }[]).map((c) => [
      c.compra_id,
      Number(c.costo_unitario_cents ?? 0),
    ]),
  );
  const ventaDe = new Map(
    ((ventas ?? []) as { id: string; customer_name: string | null; total_cents: number }[]).map(
      (v) => [v.id, v],
    ),
  );
  const nombreDe = new Map(
    ((profs ?? []) as { id: string; full_name: string | null }[]).map((u) => [
      u.id,
      u.full_name ?? "—",
    ]),
  );

  // Running balance computed BACKWARDS from today's stock: the newest movement
  // landed on the current quantity, so each older one sat on the balance before
  // the movement after it. This stays correct even when the list is capped.
  let saldo = Number(p.quantity ?? 0);
  const movimientos: MovimientoCardex[] = movs.map((m) => {
    const saldoDespues = saldo;
    saldo -= Number(m.delta ?? 0); // walking back in time

    let detalle: string | null = m.note;
    let costo: number | null = null;
    let href: string | null = null;

    if (m.reason.startsWith("purchase") && m.ref_id) {
      const c = compraDe.get(m.ref_id);
      if (c) {
        detalle = [c.folio_factura || "Sin folio", c.proveedores?.nombre].filter(Boolean).join(" · ");
        href = `/compras/${m.ref_id}`;
      }
      costo = costoDe.get(m.ref_id) ?? null;
    } else if (m.reason === "sale" && m.ref_id) {
      const v = ventaDe.get(m.ref_id);
      if (v) detalle = v.customer_name || "Mostrador";
    }

    return {
      id: m.id,
      fecha: m.created_at,
      reason: m.reason,
      delta: Number(m.delta ?? 0),
      saldo: saldoDespues,
      titulo: TITULO[m.reason] ?? m.reason,
      detalle,
      costo_unitario_cents: costo,
      quien: m.created_by ? nombreDe.get(m.created_by) ?? m.created_by : "—",
      href,
    };
  });

  // Totals over the window we read (say so in the UI, don't imply all-time).
  let comprado = 0,
    vendido = 0,
    devuelto = 0,
    ajustado = 0,
    costoTotal = 0,
    piezasConCosto = 0;
  for (const m of movimientos) {
    if (m.reason === "purchase") {
      comprado += m.delta;
      if (m.costo_unitario_cents != null) {
        costoTotal += m.costo_unitario_cents * m.delta;
        piezasConCosto += m.delta;
      }
    } else if (m.reason === "sale") vendido += Math.abs(m.delta);
    else if (m.reason === "return") devuelto += m.delta;
    else if (m.reason === "adjustment") ajustado += m.delta;
  }

  return {
    producto: { ...p, proveedor: p.proveedores?.nombre ?? null },
    movimientos,
    resumen: {
      comprado,
      vendido,
      devuelto,
      ajustado,
      costoPromedioCents: piezasConCosto > 0 ? Math.round(costoTotal / piezasConCosto) : null,
    },
  };
}
