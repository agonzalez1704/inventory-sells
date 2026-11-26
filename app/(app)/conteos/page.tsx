import { getPermisos, requirePagePermiso } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { listarConteos } from "@/modules/conteos/actions";
import { ConteosView } from "@/modules/conteos/ConteosView";

export default async function ConteosPage() {
  const userId = await requirePagePermiso("inventario_ver", "/inventario");
  const perms = await getPermisos(userId);
  const puedeAbrir = perms.has("admin_total") || perms.has("inventario_gestionar");

  const [{ data: invData }, conteos] = await Promise.all([
    insforgeAdmin.database
      .from("inventories")
      .select("id, name, es_dropship, solo_consulta")
      .order("name"),
    listarConteos(),
  ]);
  // Only shelves with physical stock can be counted.
  const inventarios = ((invData ?? []) as { id: string; name: string; es_dropship: boolean | null; solo_consulta: boolean | null }[])
    .filter((i) => !i.es_dropship && !i.solo_consulta)
    .map(({ id, name }) => ({ id, name }));

  return <ConteosView inventarios={inventarios} conteos={conteos} puedeAbrir={puedeAbrir} />;
}
