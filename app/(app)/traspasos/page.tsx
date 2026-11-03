import { requirePagePermiso } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { listarTraspasos } from "@/modules/traspasos/actions";
import { TraspasosView } from "@/modules/traspasos/TraspasosView";

export default async function TraspasosPage() {
  await requirePagePermiso("inventario_gestionar", "/inventario");

  const [{ data: invData }, traspasos] = await Promise.all([
    // Dropship inventories hold no physical stock — nothing to move.
    insforgeAdmin.database
      .from("inventories")
      .select("id, name, es_dropship, solo_consulta")
      .order("name"),
    listarTraspasos(),
  ]);
  const inventarios = ((invData ?? []) as { id: string; name: string; es_dropship: boolean | null; solo_consulta: boolean | null }[])
    .filter((i) => !i.es_dropship && !i.solo_consulta)
    .map(({ id, name }) => ({ id, name }));

  return <TraspasosView inventarios={inventarios} traspasos={traspasos} />;
}
