import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";
import type { TipoPieza } from "./actions";

/** What kind of part a customer's words name — the demand list groups by it. */
export function tipoDe(texto: string): TipoPieza {
  const t = texto.toLowerCase();
  if (/\b(pantallas?|displays?|m[oó]dulos?|oled|incell|lcd)\b/.test(t)) return "pantalla";
  if (/\b(bater[ií]as?|bat|pila)\b/.test(t)) return "bateria";
  if (/\btapas?\b/.test(t)) return "tapa";
  if (/\bflex\b/.test(t)) return "flex";
  return "otro";
}

/**
 * The WhatsApp agent writes down what it could not sell, like the counter does.
 *
 * Same list as "Piden y no hay", with the phone as the callback contact. The
 * agent searches several times per message, so the same ask from the same
 * phone counts once a day. Never throws: a failed note must not cost the
 * customer their answer.
 */
export async function anotarDemandaAgente(input: {
  texto: string;
  telefono: string;
  customerId?: string | null;
  productId?: string | null;
}): Promise<void> {
  try {
    const texto = input.texto.trim().slice(0, 200);
    if (texto.length < 2) return;
    const db = insforgeAdmin.database;
    const { data: normData } = await db.rpc("normalizar_demanda", { p_texto: texto });
    const norm = String(normData ?? texto.toLowerCase());
    const { data: previo } = await db
      .from("demanda_no_surtida")
      .select("id")
      .eq("norm", norm)
      .eq("contacto", input.telefono)
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString())
      .limit(1);
    if ((previo ?? []).length) return;
    await db.from("demanda_no_surtida").insert([
      {
        texto,
        norm,
        tipo: tipoDe(texto),
        qty: 1,
        product_id: input.productId ?? null,
        customer_id: input.customerId ?? null,
        contacto: input.telefono,
        nota: "Lo pidió por WhatsApp",
        created_by: "agente_whatsapp",
      },
    ]);
  } catch (e) {
    console.error("[demanda] no se pudo anotar desde WhatsApp:", e);
  }
}
