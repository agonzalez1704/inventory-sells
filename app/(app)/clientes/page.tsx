import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { getPermisos } from "@/lib/auth/profile";
import { ClientesView } from "@/modules/customers/ClientesView";
import { CUSTOMER_COLS, type Customer } from "@/modules/customers/actions";
import { saldosDeClientes } from "@/modules/garantias/cliente-actions";


export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const { userId } = await auth();
  const isAdmin = userId ? (await getPermisos(userId)).has("admin_total") : false;
  const insforge = await createInsForgeServerClient();
  const [{ data }, saldos, { data: invs }] = await Promise.all([
    insforge.database
      .from("customers")
      .select(CUSTOMER_COLS)
      .eq("is_active", true)
      .order("is_system", { ascending: false })
      .order("nombre", { ascending: true }),
    saldosDeClientes(),
    insforge.database.from("inventories").select("id, name").order("name"),
  ]);

  return (
    <ClientesView
      initial={(data ?? []) as unknown as Customer[]}
      saldos={saldos}
      isAdmin={isAdmin}
      inventarios={(invs ?? []) as { id: string; name: string }[]}
      initialQuery={q ?? ""}
    />
  );
}
