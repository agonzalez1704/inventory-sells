import { createInsForgeServerClient } from "@/lib/insforge/server";
import { requirePagePermiso, getPermisos } from "@/lib/auth/profile";
import { getPrecioBasePos } from "@/modules/sales/pos-prefs";
import { SalesScreen, type SalesProduct } from "@/modules/sales/SalesScreen";
import { listarCategorias } from "@/modules/inventory/buscar";
import { fiadoExigeCliente, posClickAbreDetalle, comprobanteObligatorio } from "@/modules/config/negocio";


// The register: search products, build the cart, cobrar. The sales history lives
// in its own tab (/ventas) so this screen stays focused on ringing up a sale.
export default async function PosPage() {
  const userId = await requirePagePermiso("pos_vender");
  const perms = await getPermisos(userId);
  const verCostos = perms.has("admin_total") || perms.has("costos_ver");
  const insforge = await createInsForgeServerClient();

  // The first screenful, not the catalog. Shipping every active product was
  // fine at 614 and is ~3 MB per page load at 21k — before the till can ring
  // anything up. Searching happens in the database from here on.
  const [{ data: productData }, { data: invData }, { data: customerData }, categoriasData] =
    await Promise.all([
      insforge.database
        .from("products")
        .select(
          "id, inventory_id, sku, name, brand, size, category, price_cents, cost_cents, quantity, image_url",
        )
        .eq("is_active", true)
        .order("quantity", { ascending: false })
        .order("name", { ascending: true })
        .limit(30),
      insforge.database.from("inventories").select("id, name"),
      insforge.database
        .from("customers")
        .select("id, nombre, telefono, is_system")
        .eq("is_active", true)
        .order("is_system", { ascending: false })
        .order("nombre", { ascending: true }),
      listarCategorias(),
    ]);

  const [precioBase, exigeCliente, clickDetalle, comprobanteOblig] = await Promise.all([
    getPrecioBasePos(),
    fiadoExigeCliente(),
    posClickAbreDetalle(),
    comprobanteObligatorio(),
  ]);

  const invName = new Map(
    ((invData ?? []) as { id: string; name: string }[]).map((i) => [i.id, i.name]),
  );
  // The cost is fetched but dropped before this reaches a browser that may not
  // see it. This first screenful renders before any search runs, so leaving it
  // in would hand the cost of thirty products to every seller who opens the
  // till, whether or not the card draws it. (The select stays one literal: the
  // SDK types it at compile time and cannot parse a ternary.)
  const products = (
    (productData ?? []) as (SalesProduct & { inventory_id: string })[]
  ).map((p) => ({
    ...p,
    cost_cents: verCostos ? p.cost_cents : undefined,
    inventory_name: invName.get(p.inventory_id) ?? null,
  }));

  const customers = (customerData ?? []) as {
    id: string;
    nombre: string;
    telefono: string;
    is_system: boolean;
  }[];

  // Counts travel with them: they decide which get a chip and which sit in
  // the searchable list.
  const categorias = categoriasData;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Punto de venta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Busca, agrega al carrito y cobra. El stock se descuenta solo.
        </p>
      </div>

      <SalesScreen
        products={products}
        categorias={categorias}
        customers={customers}
        verCostos={verCostos}
        precioBase={precioBase}
        fiadoExigeCliente={exigeCliente}
        clickAbreDetalle={clickDetalle}
        comprobanteObligatorio={comprobanteOblig}
      />
    </section>
  );
}
