import { requirePagePermiso } from "@/lib/auth/profile";
import { ProveedoresView } from "@/modules/proveedores/ProveedoresView";
import { listarProveedores, conteoPorProveedor } from "@/modules/proveedores/actions";


export default async function ProveedoresPage() {
  await requirePagePermiso("abastecer");
  // Reaching this page already means gestionar; the view's flag stays true.
  const puedeGestionar = true;

  const [proveedores, conteo] = await Promise.all([
    listarProveedores(true), // archived included; the view separates them
    conteoPorProveedor(),
  ]);

  return (
    <ProveedoresView initial={proveedores} conteo={conteo} puedeGestionar={puedeGestionar} />
  );
}
