import { requirePagePermiso } from "@/lib/auth/profile";
import { MARCA } from "@/lib/marca";
import { faltantesPorProveedor, pedidosEnCamino, proveedoresParaSurtir } from "@/modules/surtido/actions";
import { SurtidoView } from "@/modules/surtido/SurtidoView";

export default async function SurtidoPage() {
  await requirePagePermiso("surtir", "/inventario");
  const [grupos, enCamino, proveedores] = await Promise.all([
    faltantesPorProveedor(),
    pedidosEnCamino(),
    proveedoresParaSurtir(),
  ]);
  return <SurtidoView grupos={grupos} enCamino={enCamino} proveedores={proveedores} negocio={MARCA.nombre} />;
}
