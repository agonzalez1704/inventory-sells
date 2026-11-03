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
