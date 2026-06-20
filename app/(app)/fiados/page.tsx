import { createInsForgeServerClient } from "@/lib/insforge/server";
import { LoansView, type Loan } from "@/modules/loans/LoansView";

export default async function FiadosPage() {
  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database
    .from("sales")
    .select("id, total_cents, note, created_at, sale_items(qty, products(name, sku))")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  // PostgREST returns the to-one `products` embed as an object; the SDK's
  // generic types it as an array, so cast through unknown.
  const loans = (data ?? []) as unknown as Loan[];

  return (
    <>
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}
      <LoansView loans={loans} />
    </>
  );
}
