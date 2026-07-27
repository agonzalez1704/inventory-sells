import { createInsForgeServerClient } from "@/lib/insforge/server";
import { SalesScreen, type SalesProduct } from "@/modules/sales/SalesScreen";

export const dynamic = "force-dynamic";

// The register: search products, build the cart, cobrar. The sales history lives
// in its own tab (/ventas) so this screen stays focused on ringing up a sale.
export default async function PosPage() {
  const insforge = await createInsForgeServerClient();

  const [{ data: productData }, { data: invData }, { data: customerData }] =
    await Promise.all([
      insforge.database
        .from("products")
        .select(
          "id, inventory_id, sku, name, brand, size, category, price_cents, quantity, image_url",
        )
        .eq("is_active", true)
        .order("name", { ascending: true }),
      insforge.database.from("inventories").select("id, name"),
      insforge.database
        .from("customers")
        .select("id, nombre, telefono, is_system")
        .eq("is_active", true)
        .order("is_system", { ascending: false })
        .order("nombre", { ascending: true }),
    ]);

  const invName = new Map(
    ((invData ?? []) as { id: string; name: string }[]).map((i) => [i.id, i.name]),
  );
  const products = (
    (productData ?? []) as (SalesProduct & { inventory_id: string })[]
  ).map((p) => ({ ...p, inventory_name: invName.get(p.inventory_id) ?? null }));

  const customers = (customerData ?? []) as {
    id: string;
    nombre: string;
    telefono: string;
    is_system: boolean;
  }[];

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Punto de venta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Busca, agrega al carrito y cobra. El stock se descuenta solo.
        </p>
      </div>

      <SalesScreen products={products} customers={customers} />
    </section>
  );
}
