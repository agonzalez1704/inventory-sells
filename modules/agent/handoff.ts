import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";

const DB = insforgeAdmin.database;

// Whether the bot is still driving a conversation, or a human took over.
export async function estadoConversacion(
  numero: string,
): Promise<"bot" | "asesor"> {
  const { data } = await DB.from("conversaciones")
    .select("estado")
    .eq("numero", numero)
    .maybeSingle();
  return (data as { estado?: string } | null)?.estado === "asesor"
    ? "asesor"
    : "bot";
}

// Flag a conversation for a human (exists-check upsert, since the SDK has no
// portable upsert). Pauses the bot for this number.
export async function marcarAsesor(
  numero: string,
  motivo: string,
  ultimoTexto: string,
): Promise<void> {
  const fila = {
    estado: "asesor",
    motivo,
    ultimo_texto: ultimoTexto,
    handoff_at: new Date().toISOString(),
  };
  const { data: existe } = await DB.from("conversaciones")
    .select("numero")
    .eq("numero", numero)
    .maybeSingle();
  if (existe) {
    await DB.from("conversaciones").update(fila).eq("numero", numero);
  } else {
    await DB.from("conversaciones").insert([{ numero, ...fila }]);
  }
}
