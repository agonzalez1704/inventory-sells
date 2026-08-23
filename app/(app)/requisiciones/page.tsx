import { requirePagePermiso } from "@/lib/auth/profile";
import { listarInventarios, listarRequisiciones } from "@/modules/requisiciones/actions";
import { RequisicionesView } from "@/modules/requisiciones/RequisicionesView";


export default async function RequisicionesPage() {
  await requirePagePermiso("abastecer", "/inventario");
  const [inventarios, requisiciones] = await Promise.all([
    listarInventarios(),
    listarRequisiciones(),
  ]);
  return <RequisicionesView inventarios={inventarios} requisiciones={requisiciones} />;
}
