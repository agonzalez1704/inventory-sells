import { requirePagePermiso } from "@/lib/auth/profile";
import { listarCompras } from "@/modules/compras/actions";
import { ComprasView } from "@/modules/compras/ComprasView";

export const dynamic = "force-dynamic";

export default async function ComprasPage() {
  await requirePagePermiso("inventario_gestionar", "/inventario");
  const compras = await listarCompras();
  return <ComprasView compras={compras} />;
}
