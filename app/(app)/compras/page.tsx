import { requirePagePermiso } from "@/lib/auth/profile";
import { listarCompras, cuentasPorPagar } from "@/modules/compras/actions";
import { ComprasView } from "@/modules/compras/ComprasView";


export default async function ComprasPage() {
  await requirePagePermiso("abastecer", "/inventario");
  const [compras, porPagar] = await Promise.all([listarCompras(), cuentasPorPagar()]);
  return <ComprasView compras={compras} porPagar={porPagar} />;
}
