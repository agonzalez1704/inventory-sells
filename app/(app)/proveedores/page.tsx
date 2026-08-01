import { getPermisos, requirePagePermiso } from "@/lib/auth/profile";
import { ProveedoresView } from "@/modules/proveedores/ProveedoresView";
import { listarProveedores, conteoPorProveedor } from "@/modules/proveedores/actions";

export const dynamic = "force-dynamic";

export default async function ProveedoresPage() {
  const userId = await requirePagePermiso("inventario_ver");
  const perms = await getPermisos(userId);
  const puedeGestionar = perms.has("admin_total") || perms.has("inventario_gestionar");

  const [proveedores, conteo] = await Promise.all([
    listarProveedores(true), // archived included; the view separates them
    conteoPorProveedor(),
  ]);

  return (
    <ProveedoresView initial={proveedores} conteo={conteo} puedeGestionar={puedeGestionar} />
  );
}
