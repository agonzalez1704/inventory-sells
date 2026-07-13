import { createInsForgeServerClient } from "@/lib/insforge/server";
import { ClientesView } from "@/modules/customers/ClientesView";
import type { Customer } from "@/modules/customers/actions";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const insforge = await createInsForgeServerClient();
  const { data } = await insforge.database
    .from("customers")
    .select(
      "id, nombre, telefono, email, descuento_pct, tipo, notas, is_active, is_system, created_at",
    )
    .eq("is_active", true)
    .order("is_system", { ascending: false })
    .order("nombre", { ascending: true });

  return <ClientesView initial={(data ?? []) as Customer[]} />;
}
