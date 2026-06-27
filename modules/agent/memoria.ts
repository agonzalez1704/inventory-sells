import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";

export type Turno = { role: "user" | "assistant"; content: string };

const DB = insforgeAdmin.database;

// Last N turns for a WhatsApp number, oldest first. Only the recent session
// (last 6h) — otherwise a day-old question bleeds into a fresh one and the
// agent answers the wrong product.
export async function cargarHistorial(
  numero: string,
  limite = 10,
): Promise<Turno[]> {
  const desde = new Date(Date.now() - 6 * 3_600_000).toISOString();
  const { data } = await DB.from("wa_mensajes")
    .select("rol, contenido")
    .eq("numero", numero)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(limite);
  const rows = (data ?? []) as { rol: "user" | "assistant"; contenido: string }[];
  return rows
    .reverse()
    .map((r) => ({ role: r.rol, content: r.contenido }));
}

export async function guardarMensaje(
  numero: string,
  role: "user" | "assistant",
  contenido: string,
): Promise<void> {
  try {
    await DB.from("wa_mensajes").insert([{ numero, rol: role, contenido }]);
  } catch {
    /* best-effort: never block the reply on persistence */
  }
}
