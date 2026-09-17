import { createInsForgeServerClient } from "@/lib/insforge/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { getPermisos, getProfile, requirePagePermiso } from "@/lib/auth/profile";
import { mxHoy, rangoUTC } from "@/lib/caja-range";
import type { SaleWithItems } from "@/modules/sales/RecentSales";
import { VentasView, type ResumenVentas, type VentaLista } from "@/modules/sales/VentasView";
import type { PaymentMethod } from "@/lib/types";


const METODOS: PaymentMethod[] = ["efectivo", "tarjeta", "transferencia", "otro"];
const CANALES = ["mostrador", "online"] as const;

// The sales browser: filter by date range, payment method and channel, review a
// sale's items, and correct or return it. The register itself lives in /pos.
export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    metodo?: string;
    canal?: string;
    venta?: string;
    solo?: string;
  }>;
}) {
  const sp = await searchParams;
  const hoy = mxHoy();
  const from = sp.from ?? hoy;
  const to = sp.to ?? from;
  const abrirId = sp.venta ?? null;
  const metodo = METODOS.includes(sp.metodo as PaymentMethod) ? (sp.metodo as PaymentMethod) : null;
  const canal = (CANALES as readonly string[]).includes(sp.canal ?? "") ? sp.canal! : null;
  const { startISO, endISO } = rangoUTC(from, to);

  const userId = await requirePagePermiso("pos_vender");
  const profile = await getProfile(userId);
  const isAdmin = profile?.role === "admin";
  // A seller sees only their own sales. Seeing everyone's rides the same
  // permiso that already means "read sales beyond your own" everywhere else
  // (ventas_ver); admin_total passes as always.
  const perms = await getPermisos(userId);
  const veTodas = perms.has("admin_total") || perms.has("ventas_ver");

  const insforge = await createInsForgeServerClient();

  const { data: customerData } = await insforge.database
    .from("customers")
    .select("id, nombre, telefono, is_system")
    .eq("is_active", true)
    .order("is_system", { ascending: false })
    .order("nombre", { ascending: true });
  const customers = (customerData ?? []) as {
    id: string;
    nombre: string;
    telefono: string;
    is_system: boolean;
  }[];

  const SELECT_VENTA =
    "id, total_cents, payment_method, customer_name, canal, created_at, settled_at, sold_by, sale_items(product_id, qty, unit_price_cents, products(name, sku, image_url))";

  // A sale belongs to the day its money landed. Direct sales land when they
  // are created; a credit note lands when it settles — so the range filters
  // created_at for one and settled_at for the other, and a note written last
  // week but paid today shows up today, which is when it became a sale.
  let directasQuery = insforge.database
    .from("sales")
    .select(SELECT_VENTA)
    .eq("status", "completed")
    .is("settled_at", null)
    .gte("created_at", startISO)
    .lt("created_at", endISO)
    .order("created_at", { ascending: false })
    .limit(300);
  let cobradasQuery = insforge.database
    .from("sales")
    .select(SELECT_VENTA)
    .eq("status", "completed")
    .gte("settled_at", startISO)
    .lt("settled_at", endISO)
    .order("settled_at", { ascending: false })
    .limit(300);
  if (!veTodas) {
    directasQuery = directasQuery.eq("sold_by", userId);
    cobradasQuery = cobradasQuery.eq("sold_by", userId);
  }
  // The method filter is applied below, after counting: the rail shows how
  // many sales each method has in the period.
  if (canal) {
    directasQuery = directasQuery.eq("canal", canal);
    cobradasQuery = cobradasQuery.eq("canal", canal);
  }

  const [{ data: directasData }, { data: cobradasData }, { data: profileData }] = await Promise.all([
    directasQuery,
    cobradasQuery,
    insforge.database.from("profiles").select("id, full_name"),
  ]);
  const salesData = [...(directasData ?? []), ...(cobradasData ?? [])];

  const sellerName = new Map(
    ((profileData ?? []) as { id: string; full_name: string | null }[]).map((p) => [
      p.id,
      p.full_name,
    ]),
  );
  const sales = (salesData as unknown as SaleWithItems[])
    .map((s) => ({
      ...s,
      vendedor: (s.sold_by ? sellerName.get(s.sold_by) : null) ?? null,
    }))
    .sort((a, b) =>
      (b.settled_at ?? b.created_at).localeCompare(a.settled_at ?? a.created_at),
    );

  // Show items NET of returns; a fully-returned sale drops off the list.
  const saleIds = sales.map((s) => s.id);
  const returnedBySale = new Map<string, Map<string, number>>();
  if (saleIds.length) {
    const { data: devData } = await insforge.database
      .from("devoluciones")
      .select("sale_id, devolucion_items(product_id, qty)")
      .in("sale_id", saleIds);
    for (const d of (devData ?? []) as {
      sale_id: string;
      devolucion_items: { product_id: string; qty: number }[];
    }[]) {
      const m = returnedBySale.get(d.sale_id) ?? new Map<string, number>();
      for (const it of d.devolucion_items ?? []) {
        m.set(it.product_id, (m.get(it.product_id) ?? 0) + it.qty);
      }
      returnedBySale.set(d.sale_id, m);
    }
  }

  const netSales = sales
    .map((s) => {
      const ret = returnedBySale.get(s.id);
      if (!ret) return s;
      const sale_items = s.sale_items
        .map((it) => ({
          ...it,
          qty: it.qty - (it.product_id ? ret.get(it.product_id) ?? 0 : 0),
        }))
        .filter((it) => it.qty > 0);
      const total_cents = sale_items.reduce((a, it) => a + it.unit_price_cents * it.qty, 0);
      return { ...s, sale_items, total_cents };
    })
    .filter((s) => s.sale_items.length > 0);

  // Deep-link from a push notification: if the sale isn't in the current range
  // (e.g. the notification was tapped the next day), fetch it and pin it on top
  // so the link always lands on the right sale.
  let lista = netSales;
  if (abrirId && !netSales.some((s) => s.id === abrirId)) {
    const { data: one } = await insforge.database
      .from("sales")
      .select(SELECT_VENTA)
      .eq("id", abrirId)
      .eq("status", "completed")
      .maybeSingle();
    // The deep link honors the same scope as the list: a seller tapping a
    // notification for someone else's sale gets nothing pinned, not a
    // stranger's ticket.
    const esVisible =
      one && (veTodas || (one as { sold_by?: string | null }).sold_by === userId);
    if (esVisible) {
      const s = one as unknown as SaleWithItems;
      lista = [
        { ...s, vendedor: (s.sold_by ? sellerName.get(s.sold_by) : null) ?? null },
        ...netSales,
      ];
    }
  }

  // Which business account each transfer landed in, via the tagged proofs
  // (admin client: proofs aren't in the viewer's RLS surface). Web-order sales
  // carry their proof on the orden, so those map back through sale_id.
  const transferIds = lista
    .filter((s) => s.payment_method === "transferencia" || s.payment_method === "mixto")
    .map((s) => s.id);
  if (transferIds.length) {
    const [{ data: compData }, { data: ordData }] = await Promise.all([
      insforgeAdmin.database
        .from("comprobantes_pago")
        .select("sale_id, orden_id, cuentas_negocio(id, banco, alias)")
        .not("cuenta_id", "is", null),
      insforgeAdmin.database
        .from("ordenes_web")
        .select("id, sale_id")
        .in("sale_id", transferIds),
    ]);
    type CuentaRow = { id: string; banco: string; alias: string };
    const porSale = new Map<string, CuentaRow>();
    const porOrden = new Map<string, CuentaRow>();
    for (const c of (compData ?? []) as unknown as {
      sale_id: string | null;
      orden_id: string | null;
      cuentas_negocio: CuentaRow | CuentaRow[] | null;
    }[]) {
      const cuenta = Array.isArray(c.cuentas_negocio)
        ? c.cuentas_negocio[0] ?? null
        : c.cuentas_negocio;
      if (!cuenta) continue;
      if (c.sale_id) porSale.set(c.sale_id, cuenta);
      if (c.orden_id) porOrden.set(c.orden_id, cuenta);
    }
    for (const o of (ordData ?? []) as { id: string; sale_id: string | null }[]) {
      if (o.sale_id && !porSale.has(o.sale_id)) {
        const cuenta = porOrden.get(o.id);
        if (cuenta) porSale.set(o.sale_id, cuenta);
      }
    }
    lista = lista.map((s) => ({ ...s, cuenta: porSale.get(s.id) ?? null }));
  }

  const porMetodo: ResumenVentas["porMetodo"] = {};
  for (const v of netSales) {
    const m = v.payment_method ?? "otro";
    const r = (porMetodo[m] ??= { n: 0, totalCents: 0 });
    r.n += 1;
    r.totalCents += v.total_cents;
  }
  const visibles = lista.filter(
    (v) => v.id === abrirId || ((!metodo || v.payment_method === metodo) && (sp.solo !== "fiados" || v.settled_at)),
  );
  const enFiltro = visibles.filter((v) => v.id !== abrirId || netSales.some((n) => n.id === v.id));

  return (
    <VentasView
      ventas={visibles as VentaLista[]}
      resumen={{
        count: enFiltro.length,
        totalCents: enFiltro.reduce((a, v) => a + v.total_cents, 0),
        porMetodo,
        fiados: netSales.filter((v) => v.settled_at).length,
      }}
      filtros={{ from, to, metodo, canal, solo: sp.solo === "fiados" ? "fiados" : null }}
      hoy={hoy}
      customers={customers}
      isAdmin={isAdmin}
      abrirId={abrirId}
    />
  );
}
