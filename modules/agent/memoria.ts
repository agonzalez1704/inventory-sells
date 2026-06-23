import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";

export type Turno = { role: "user" | "assistant"; content: string };

const DB = insforgeAdmin.database;

// Last N turns for a WhatsApp number, oldest first.
export async function cargarHistorial(
  numero: string,
  limite = 10,
): Promise<Turno[]> {
  const { data } = await DB.from("wa_mensajes")
    .select("rol, contenido")
    .eq("numero", numero)
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
