import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { getProfile, requirePagePermiso } from "@/lib/auth/profile";
import { mxHoy, rangoUTC } from "@/lib/caja-range";
import { RecentSales, type SaleWithItems } from "@/modules/sales/RecentSales";
import { VentasFiltros } from "@/modules/sales/VentasFiltros";
import type { PaymentMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

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
  }>;
}) {
  const sp = await searchParams;
  const from = sp.from ?? mxHoy();
  const to = sp.to ?? from;
  const abrirId = sp.venta ?? null;
  const metodo = METODOS.includes(sp.metodo as PaymentMethod) ? (sp.metodo as PaymentMethod) : null;
  const canal = (CANALES as readonly string[]).includes(sp.canal ?? "") ? sp.canal! : null;
  const { startISO, endISO } = rangoUTC(from, to);

  await requirePagePermiso("pos_vender");
  const { userId } = await auth();
  const profile = userId ? await getProfile(userId) : null;
  const isAdmin = profile?.role === "admin";

  const insforge = await createInsForgeServerClient();

  let ventasQuery = insforge.database
    .from("sales")
    .select(
      "id, total_cents, payment_method, customer_name, canal, created_at, sold_by, sale_items(product_id, qty, unit_price_cents, products(name, sku))",
    )
    .eq("status", "completed")
    .gte("created_at", startISO)
    .lt("created_at", endISO)
    .order("created_at", { ascending: false })
    .limit(300);
  if (metodo) ventasQuery = ventasQuery.eq("payment_method", metodo);
  if (canal) ventasQuery = ventasQuery.eq("canal", canal);

  const [
    { data: salesData },
    { data: invData },
    { data: profileData },
  ] = await Promise.all([
    ventasQuery,
    insforge.database.from("inventories").select("id, name"),
    insforge.database.from("profiles").select("id, full_name"),
  ]);

  const sellerName = new Map(
    ((profileData ?? []) as { id: string; full_name: string | null }[]).map((p) => [
      p.id,
      p.full_name,
    ]),
  );
  const sales = ((salesData ?? []) as unknown as SaleWithItems[]).map((s) => ({
    ...s,
    vendedor: (s.sold_by ? sellerName.get(s.sold_by) : null) ?? null,
  }));

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
      .select(
        "id, total_cents, payment_method, customer_name, canal, created_at, sold_by, sale_items(product_id, qty, unit_price_cents, products(name, sku))",
      )
      .eq("id", abrirId)
      .eq("status", "completed")
      .maybeSingle();
    if (one) {
      const s = one as unknown as SaleWithItems;
      lista = [
        { ...s, vendedor: (s.sold_by ? sellerName.get(s.sold_by) : null) ?? null },
        ...netSales,
      ];
    }
  }

  const totalPeriodo = netSales.reduce((a, s) => a + s.total_cents, 0);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Filtra por fecha, método y canal. Toca una venta para ver sus productos
          {isAdmin ? ", corregir el pago o registrar una devolución" : ""}.
        </p>
      </div>

      <VentasFiltros
        from={from}
        to={to}
        metodo={metodo}
        canal={canal}
        count={netSales.length}
        totalCents={totalPeriodo}
      />

      <RecentSales
        sales={lista}
        isAdmin={isAdmin}
        abrirId={abrirId}
        titulo="Ventas del periodo"
        subtitulo="Toca una venta para ver sus productos. La búsqueda abarca todas las ventas."
      />
    </section>
  );
}
