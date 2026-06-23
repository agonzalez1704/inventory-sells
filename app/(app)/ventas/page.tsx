import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { getProfile } from "@/lib/auth/profile";
import type { Sale } from "@/lib/types";
import { SalesScreen, type SalesProduct } from "@/modules/sales/SalesScreen";
import { RecentSales } from "@/modules/sales/RecentSales";

export default async function VentasPage() {
  const { userId } = await auth();
  const profile = userId ? await getProfile(userId) : null;
  const isAdmin = profile?.role === "admin";

  const insforge = await createInsForgeServerClient();

  const [{ data: productData }, { data: salesData }, { data: invData }] =
    await Promise.all([
      insforge.database
        .from("products")
        .select("id, inventory_id, sku, name, size, price_cents, quantity")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      insforge.database
        .from("sales")
        .select("id, total_cents, payment_method, customer_name, created_at")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(8),
      insforge.database.from("inventories").select("id, name"),
    ]);

  const invName = new Map(
    ((invData ?? []) as { id: string; name: string }[]).map((i) => [i.id, i.name]),
  );
  const products = (
    (productData ?? []) as (SalesProduct & { inventory_id: string })[]
  ).map((p) => ({ ...p, inventory_name: invName.get(p.inventory_id) ?? null }));
  const sales = (salesData ?? []) as Sale[];

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Busca, agrega al carrito y cobra. El stock se descuenta solo.
          {isAdmin && " Toca una venta reciente para corregir el pago."}
        </p>
      </div>

      <SalesScreen products={products} />

      <RecentSales sales={sales} isAdmin={isAdmin} />
    </section>
  );
}
