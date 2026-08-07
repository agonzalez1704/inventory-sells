"use server";

import { insforgeAdmin } from "@/lib/insforge/admin";
import { assertPermiso } from "@/lib/auth/profile";
import { attempt, type ActionResult } from "@/lib/errors";
import { enviarTexto } from "@/lib/kapso";
import { guardarMensaje } from "./memoria";

export type ConversacionBandeja = {
  clave: string;
  telefono: string | null;
  username: string | null;
  cliente_nombre: string | null;
  cliente_id: string | null;
  estado: "bot" | "asesor";
  motivo: string | null;
  ultimo_texto: string;
  ultimo_rol: "user" | "assistant" | "asesor";
  ultimo_at: string;
  mensajes: number;
};

export type MensajeBandeja = {
  id: string;
  rol: "user" | "assistant" | "asesor";
  contenido: string;
  created_at: string;
};

/** Every conversation, newest first — not only the ones the agent escalated. */
export async function listarConversaciones(): Promise<ConversacionBandeja[]> {
  await assertPermiso("pos_vender");
  const { data } = await insforgeAdmin.database.rpc("wa_bandeja", { p_limite: 100 });
  return ((data ?? []) as ConversacionBandeja[]).map((c) => ({
    ...c,
    mensajes: Number(c.mensajes),
  }));
}

export async function verHilo(clave: string): Promise<MensajeBandeja[]> {
  await assertPermiso("pos_vender");
  const { data } = await insforgeAdmin.database
    .from("wa_mensajes")
    .select("id, rol, contenido, created_at")
    .eq("numero", clave)
    .order("created_at", { ascending: true })
    .limit(400);
  return (data ?? []) as MensajeBandeja[];
}

/**
 * Take the conversation over, or hand it back to the agent.
 *
 * Writes the same row the agent's own escalation writes, so the webhook's
 * existing "is a human driving this?" check keeps working untouched — the bot
 * stops replying the moment this returns.
 */
export async function tomarConversacion(
  clave: string,
  tomar: boolean,
): Promise<ActionResult<null>> {
  return attempt("tomarConversacion", async () => {
    await assertPermiso("pos_vender");
    const { error } = await insforgeAdmin.database.rpc("wa_tomar", {
      p_clave: clave,
      p_tomar: tomar,
      p_motivo: tomar ? "Un asesor tomó la conversación" : null,
    });
    if (error) throw new Error(error.message ?? "No se pudo cambiar el control");
    return null;
  });
}

/**
 * Reply as a human, through the shop's own WhatsApp number.
 *
 * Taking over first is deliberate rather than a nicety: if the bot were still
 * driving, the customer's next message would get an automatic answer on top of
 * what a person just wrote, and the two would talk over each other.
 *
 * The message is stored with rol 'asesor' so later readings can tell what the
 * agent said from what a person said — which is the whole point of reviewing
 * old conversations to fix the prompt.
 */
export async function responder(
  clave: string,
  texto: string,
): Promise<ActionResult<null>> {
  return attempt("responder", async () => {
    await assertPermiso("pos_vender");
    const cuerpo = texto.trim();
    if (!cuerpo) throw new Error("Escribe un mensaje");

    const { data } = await insforgeAdmin.database
      .from("wa_identidades")
      .select("telefono, bsuid")
      .eq("clave", clave)
      .maybeSingle();
    const id = data as { telefono: string | null; bsuid: string | null } | null;
    // Conversations that predate identity tracking only have the key, which was
    // seeded from the phone number — so it is still a usable address.
    const telefono = id?.telefono ?? (/^\d{10,15}$/.test(clave) ? clave : "");
    const bsuid = id?.bsuid ?? "";
    if (!telefono && !bsuid) {
      throw new Error("No tengo cómo contactar a este número desde la app");
    }

    await insforgeAdmin.database.rpc("wa_tomar", {
      p_clave: clave,
      p_tomar: true,
      p_motivo: "Un asesor respondió desde la app",
    });

    const phoneNumberId = process.env.KAPSO_PHONE_NUMBER_ID ?? "";
    if (!phoneNumberId) throw new Error("Falta configurar el número de WhatsApp");
    await enviarTexto(phoneNumberId, telefono, cuerpo, bsuid || undefined);
    await guardarMensaje(clave, "asesor", cuerpo);
    return null;
  });
}
