import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { getProfile } from "@/lib/auth/profile";
import {
  InventoryView,
  type InventoryRow,
} from "@/modules/inventory/InventoryView";

export default async function InventarioPage() {
  const { userId } = await auth();
  const profile = userId ? await getProfile(userId) : null;
  const isAdmin = profile?.role === "admin";

  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database
    .from("products")
    .select("id, sku, name, category, brand, size, price_cents, quantity")
    .order("created_at", { ascending: false });

  const products = (data ?? []) as InventoryRow[];

  return (
    <>
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}
      <InventoryView products={products} isAdmin={isAdmin} />
    </>
  );
}
