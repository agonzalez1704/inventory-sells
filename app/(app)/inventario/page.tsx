import { createInsForgeServerClient } from "@/lib/insforge/server";
import { getPermisos, requirePagePermiso } from "@/lib/auth/profile";
import type { Inventory } from "@/lib/types";
import {
  InventoryView,
  type InventoryRow,
} from "@/modules/inventory/InventoryView";
import { estadisticasInventario } from "@/modules/inventory/buscar";

export default async function InventarioPage() {
  const userId = await requirePagePermiso("inventario_ver");
  const perms = await getPermisos(userId);
  const admin = perms.has("admin_total");
  const puedeGestionar = admin || perms.has("inventario_gestionar");
  const verCostos = admin || perms.has("costos_ver");
  const puedePrecios = admin || perms.has("precios_gestionar");
  const verVentas = admin || perms.has("ventas_ver");

  const insforge = await createInsForgeServerClient();
  // First page + aggregates. The full catalog used to arrive here and be
  // filtered in the browser; at 21k products that is ~3 MB per page load.
  const [{ data: productData, error, count }, { data: invData }, statsIniciales] =
    await Promise.all([
    insforge.database
      .from("products")
      .select(
        "id, inventory_id, sku, name, category, brand, size, price_cents, quantity, etiqueta, image_url, ventas_anuales",
        { count: "exact" },
      )
      .eq("is_active", true)
      .order("name", { ascending: true })
      .range(0, 49),
    insforge.database
      .from("inventories")
      .select("id, name")
      .order("name", { ascending: true }),
    estadisticasInventario(),
  ]);

  const products = (productData ?? []) as InventoryRow[];
  const inventories = (invData ?? []) as Inventory[];

  return (
    <>
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error.message}
        </p>
      )}
      <InventoryView
        products={products}
        totalInicial={Number(count ?? products.length)}
        statsIniciales={statsIniciales}
        inventories={inventories}
        puedeGestionar={puedeGestionar}
        verCostos={verCostos}
        puedePrecios={puedePrecios}
        verVentas={verVentas}
      />
    </>
  );
}
