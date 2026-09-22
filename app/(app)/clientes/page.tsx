import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { getPermisos } from "@/lib/auth/profile";
import { ClientesView } from "@/modules/customers/ClientesView";
import type { Customer } from "@/modules/customers/actions";
import { saldosDeClientes } from "@/modules/garantias/cliente-actions";


export default async function ClientesPage() {
  const { userId } = await auth();
  const isAdmin = userId ? (await getPermisos(userId)).has("admin_total") : false;
  const insforge = await createInsForgeServerClient();
  const [{ data }, saldos] = await Promise.all([
    insforge.database
    .from("customers")
      .select(
      "id, nombre, telefono, email, descuento_pct, tipo, notas, credito_dias, credito_limite_cents, is_active, is_system, created_at, customer_phones(id, telefono, etiqueta)",
    )
      .eq("is_active", true)
      .order("is_system", { ascending: false })
      .order("nombre", { ascending: true }),
    saldosDeClientes(),
  ]);

  return <ClientesView initial={(data ?? []) as Customer[]} saldos={saldos} isAdmin={isAdmin} />;
}
