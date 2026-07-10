import { createInsForgeServerClient } from "@/lib/insforge/server";
import { LoansView, type Loan, type SwapProduct } from "@/modules/loans/LoansView";

export default async function FiadosPage() {
  const insforge = await createInsForgeServerClient();

  const [
    { data, error },
    { data: productData },
    { data: invData },
    { data: profileData },
  ] = await Promise.all([
    insforge.database
      .from("sales")
      .select(
        "id, total_cents, note, created_at, sold_by, sale_items(product_id, qty, products(name, sku)), sale_pagos(monto_cents)",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    insforge.database
      .from("products")
      .select("id, inventory_id, sku, name, size, price_cents, quantity")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    insforge.database.from("inventories").select("id, name"),
    insforge.database.from("profiles").select("id, full_name"),
  ]);

  const sellerName = new Map(
    ((profileData ?? []) as { id: string; full_name: string | null }[]).map(
      (p) => [p.id, p.full_name],
    ),
  );

  // PostgREST returns the to-one `products` embed as an object; the SDK's
  // generic types it as an array, so cast through unknown. Sum abonos → pagado.
  const loans = (
    (data ?? []) as unknown as (Loan & {
      sold_by: string | null;
      sale_pagos?: { monto_cents: number }[];
    })[]
  ).map((l) => ({
    ...l,
    pagado_cents: (l.sale_pagos ?? []).reduce((s, p) => s + p.monto_cents, 0),
    vendedor: (l.sold_by ? sellerName.get(l.sold_by) : null) ?? null,
  })) as Loan[];

  const invName = new Map(
    ((invData ?? []) as { id: string; name: string }[]).map((i) => [i.id, i.name]),
  );
  const products = (
    (productData ?? []) as (SwapProduct & { inventory_id: string })[]
  ).map((p) => ({ ...p, inventory_name: invName.get(p.inventory_id) ?? null }));

  return (
    <>
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}
      <LoansView loans={loans} products={products} />
    </>
  );
}
