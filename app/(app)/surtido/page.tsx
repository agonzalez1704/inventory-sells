import { requirePagePermiso } from "@/lib/auth/profile";
import { faltantesPorProveedor } from "@/modules/surtido/actions";
import { SurtidoView } from "@/modules/surtido/SurtidoView";


export default async function SurtidoPage() {
  await requirePagePermiso("inventario_gestionar", "/inventario");
  const grupos = await faltantesPorProveedor();
  return <SurtidoView grupos={grupos} />;
}
