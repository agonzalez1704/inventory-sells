import { requirePagePermiso } from "@/lib/auth/profile";
import { listarInventarios, listarRequisiciones } from "@/modules/requisiciones/actions";
import { RequisicionesView } from "@/modules/requisiciones/RequisicionesView";

export const dynamic = "force-dynamic";

export default async function RequisicionesPage() {
  await requirePagePermiso("inventario_gestionar", "/inventario");
  const [inventarios, requisiciones] = await Promise.all([
    listarInventarios(),
    listarRequisiciones(),
  ]);
  return <RequisicionesView inventarios={inventarios} requisiciones={requisiciones} />;
}
