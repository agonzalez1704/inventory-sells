"use server";

import { insforgeAdmin } from "@/lib/insforge/admin";
import { assertPermiso } from "@/lib/auth/profile";
import { attempt, type ActionResult } from "@/lib/errors";
import { enviarTexto } from "@/lib/kapso";
import { cargarHistorial, guardarMensaje } from "./memoria";
import { estadoConversacion, marcarAsesor } from "./handoff";
import { detectarCliente } from "./cliente";
import { responderMensaje } from "./inventory-agent";

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

    const { telefono, bsuid } = await contactoDe(clave);

    await insforgeAdmin.database.rpc("wa_tomar", {
      p_clave: clave,
      p_tomar: true,
      p_motivo: "Un asesor respondió desde la app",
    });

    await enviarTexto(numeroWhatsApp(), telefono, cuerpo, bsuid || undefined);
    await guardarMensaje(clave, "asesor", cuerpo);
    return null;
  });
}

// Where to send from, and to whom. Conversations that predate identity tracking
// only have the key, which was seeded from the phone number — so it is still a
// usable address.
async function contactoDe(clave: string): Promise<{ telefono: string; bsuid: string }> {
  const { data } = await insforgeAdmin.database
    .from("wa_identidades")
    .select("telefono, bsuid")
    .eq("clave", clave)
    .maybeSingle();
  const id = data as { telefono: string | null; bsuid: string | null } | null;
  const telefono = id?.telefono ?? (/^\d{10,15}$/.test(clave) ? clave : "");
  const bsuid = id?.bsuid ?? "";
  if (!telefono && !bsuid) throw new Error("No tengo cómo contactar a este número desde la app");
  return { telefono, bsuid };
}

function numeroWhatsApp(): string {
  const id = process.env.KAPSO_PHONE_NUMBER_ID ?? "";
  if (!id) throw new Error("Falta configurar el número de WhatsApp");
  return id;
}

/**
 * Answer the customer's last message again, after teaching the agent what it
 * missed — "Guardar y contestar". Same path as a webhook reply: the agent
 * reads what it was just taught, the answer goes out through Kapso and into
 * the thread.
 */
export async function contestarDeNuevo(clave: string): Promise<ActionResult<{ texto: string }>> {
  return attempt("contestarDeNuevo", async () => {
    await assertPermiso("admin_total");
    if ((await estadoConversacion(clave)) === "asesor")
      throw new Error("La conversación la tiene un asesor: devuélvela al bot para que conteste");
    const { telefono, bsuid } = await contactoDe(clave);
    const historial = await cargarHistorial(clave, 10);
    // Re-answer the customer's message, not continue after the miss.
    while (historial.length && historial.at(-1)!.role === "assistant") historial.pop();
    const ultimo = historial.at(-1)?.content;
    if (!ultimo) throw new Error("No hay mensaje reciente del cliente que contestar (más de 6 horas)");
    const cliente = await detectarCliente(telefono);
    const { texto, escalar } = await responderMensaje(historial, clave, cliente, { correccion: true });
    await enviarTexto(numeroWhatsApp(), telefono, texto, bsuid || undefined);
    await guardarMensaje(clave, "assistant", texto);
    if (escalar) await marcarAsesor(clave, escalar.motivo, ultimo);
    return { texto };
  });
}
