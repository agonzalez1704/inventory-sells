import { createInsForgeServerClient } from "@/lib/insforge/server";
import { getPermisos, requirePagePermiso } from "@/lib/auth/profile";
import { LoansView, type Loan } from "@/modules/loans/LoansView";
import type { PickerCustomer } from "@/modules/customers/CustomerPicker";

export default async function FiadosPage({
  searchParams,
}: {
  searchParams: Promise<{ fiado?: string }>;
}) {
  const abrirId = (await searchParams).fiado ?? null;

  // Same scope rule as /ventas: a seller sees only the notes they created;
  // seeing everyone's rides ventas_ver (admin_total passes as always).
  const userId = await requirePagePermiso("pos_vender");
  const perms = await getPermisos(userId);
  const veTodas = perms.has("admin_total") || perms.has("ventas_ver");

  const insforge = await createInsForgeServerClient();

  let fiadosQuery = insforge.database
    .from("sales")
    .select(
      "id, total_cents, note, created_at, sold_by, customer_id, customers(id, nombre, telefono, is_system, credito_dias), sale_items(product_id, qty, products(name, sku)), sale_pagos(monto_cents)",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (!veTodas) fiadosQuery = fiadosQuery.eq("sold_by", userId);

  const [
    { data, error },
    { data: profileData },
    { data: customerData },
  ] = await Promise.all([
    fiadosQuery,
    insforge.database.from("profiles").select("id, full_name"),
    insforge.database
      .from("customers")
      .select("id, nombre, telefono, is_system")
      .eq("is_active", true)
      .order("is_system", { ascending: false })
      .order("nombre", { ascending: true }),
  ]);

  const sellerName = new Map(
    ((profileData ?? []) as { id: string; full_name: string | null }[]).map(
      (p) => [p.id, p.full_name],
    ),
  );

  // PostgREST returns the to-one `products`/`customers` embeds as objects; the
  // SDK's generic types them as arrays, so cast through unknown. Sum abonos.
  const loans = (
    (data ?? []) as unknown as (Loan & {
      sold_by: string | null;
      customers?: (PickerCustomer & { credito_dias?: number | null }) | null;
      sale_pagos?: { monto_cents: number }[];
    })[]
  ).map((l) => ({
    ...l,
    pagado_cents: (l.sale_pagos ?? []).reduce((s, p) => s + p.monto_cents, 0),
    vendedor: (l.sold_by ? sellerName.get(l.sold_by) : null) ?? null,
    cliente: l.customers ?? null,
    credito_dias: l.customers?.credito_dias ?? null,
  })) as Loan[];

  const customers = (customerData ?? []) as PickerCustomer[];

  return (
    <>
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error.message}
        </p>
      )}
      <LoansView loans={loans} customers={customers} abrirId={abrirId} />
    </>
  );
}
