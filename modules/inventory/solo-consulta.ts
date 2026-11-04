import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";

/**
 * Supplier inventories loaded only to SEE their stock (Grob): id → name.
 * Nothing is sold from them; a part there is sold bajo pedido and enters an
 * own inventory with the supplier's invoice.
 */
export async function inventariosSoloConsulta(): Promise<Map<string, string>> {
  const { data } = await insforgeAdmin.database.from("inventories").select("id, name").eq("solo_consulta", true);
  return new Map(((data ?? []) as { id: string; name: string }[]).map((i) => [i.id, i.name]));
}

/**
 * The own inventory a part from a supplier lands in (Mostrador in Ruli): the
 * oldest that is neither solo-consulta nor dropship.
 * ponytail: a "Lo recibe" setting on the supplier's inventory if a shop ever
 * has two own ones.
 */
export async function inventarioQueRecibe(): Promise<string> {
  const { data } = await insforgeAdmin.database
    .from("inventories")
    .select("id")
    .eq("solo_consulta", false)
    .eq("es_dropship", false)
    .order("created_at", { ascending: true })
    .limit(1);
  const id = (data as { id: string }[] | null)?.[0]?.id;
  if (!id) throw new Error("No hay un inventario propio que reciba la pieza");
  return id;
}
