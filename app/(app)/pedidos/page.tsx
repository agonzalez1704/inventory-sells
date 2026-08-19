import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { PedidosView, type PedidoWeb } from "@/modules/pedidos/PedidosView";


export default async function PedidosPage() {
  const { userId } = await auth();
  const profile = userId ? await getProfile(userId) : null;
  const isAdmin = profile?.role === "admin";

  // Pending first (that's what needs action), then the rest, newest within each.
  const { data } = await insforgeAdmin.database
    .from("ordenes_web")
    .select(
      "id, folio, nombre, telefono, status, metodo, tipo_entrega, total_cents, created_at, orden_web_items(nombre, qty)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const pedidos = ((data ?? []) as PedidoWeb[]).slice().sort((a, b) => {
    const rank = (s: string) => (s === "pendiente" ? 0 : 1);
    return rank(a.status) - rank(b.status);
  });

  return <PedidosView pedidos={pedidos} isAdmin={isAdmin} />;
}
