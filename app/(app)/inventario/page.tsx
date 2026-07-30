import { createInsForgeServerClient } from "@/lib/insforge/server";
import { getPermisos, requirePagePermiso } from "@/lib/auth/profile";
import type { Inventory } from "@/lib/types";
import {
  InventoryView,
  type InventoryRow,
} from "@/modules/inventory/InventoryView";

export default async function InventarioPage() {
  const userId = await requirePagePermiso("inventario_ver");
  const perms = await getPermisos(userId);
  const admin = perms.has("admin_total");
  const puedeGestionar = admin || perms.has("inventario_gestionar");
  const verCostos = admin || perms.has("costos_ver");
  const puedePrecios = admin || perms.has("precios_gestionar");

  const insforge = await createInsForgeServerClient();
  const [{ data: productData, error }, { data: invData }] = await Promise.all([
    insforge.database
      .from("products")
      .select(
        "id, inventory_id, sku, name, category, brand, size, price_cents, quantity, etiqueta, image_url",
      )
      .order("created_at", { ascending: false }),
    insforge.database
      .from("inventories")
      .select("id, name")
      .order("name", { ascending: true }),
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
        inventories={inventories}
        puedeGestionar={puedeGestionar}
        verCostos={verCostos}
        puedePrecios={puedePrecios}
      />
    </>
  );
}
