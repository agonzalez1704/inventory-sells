import { createHmac, timingSafeEqual } from "node:crypto";
import { responderMensaje } from "@/modules/agent/inventory-agent";
import { detectarCliente } from "@/modules/agent/cliente";
import { cargarHistorial, guardarMensaje, mensajesDelCliente } from "@/modules/agent/memoria";
import { transcribirAudio } from "@/modules/agent/transcribir";
import { estadoConversacion, marcarAsesor } from "@/modules/agent/handoff";
import { resolverRemitente, etiqueta } from "@/modules/agent/identidad";
import { getAgenteActivo, getAsesores } from "@/modules/config/lib";
import { enviarTexto, descargarMedia } from "@/lib/kapso";
import { mandarFotos } from "@/modules/agent/fotos";

export const maxDuration = 60;

function firmaValida(secret: string, raw: string, firma: string | null): boolean {
  if (!secret || !firma) return false;
  const esperado = createHmac("sha256", secret).update(raw).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(esperado), Buffer.from(firma));
  } catch {
    return false;
  }
}

// Inbound types that carry no text we can read, and what the customer hears.
const NO_LO_VEO = "Recibí tu archivo, pero todavía no puedo verlo. ¿Me escribes qué necesitas?";
const SIN_TEXTO: Record<string, string> = {
  image: NO_LO_VEO,
  video: NO_LO_VEO,
  document: NO_LO_VEO,
  location: "Recibí tu ubicación. ¿Me escribes qué necesitas?",
  contacts: "Recibí el contacto. ¿Me escribes qué necesitas?",
  audio: "No pude escuchar tu nota de voz. ¿Me lo escribes, por favor?",
};
// ponytail: one fixed cap per number; a burst Kapso buffers counts as one
// message. Make it a config field if a real customer ever hits it.
const TOPE_POR_HORA = 40;
const AL_TOPE = "Para atenderte mejor, te paso con un asesor. En un momento te contesta.";
const DISCULPA ="Perdón, tuve un problema para contestarte. Ya le avisé a un asesor para que te atienda.";

type KapsoEvent = {
  phone_number_id?: string;
  message?: {
    type?: string;
    text?: { body?: string };
    kapso?: {
      content?: string;
      transcript?: { text?: string };
      media_url?: string;
      media_data?: { content_type?: string };
    };
  };
  contact?: { id?: string | null } | null;
  conversation?: {
    phone_number?: string | null;
    business_scoped_user_id?: string | null;
    parent_business_scoped_user_id?: string | null;
    username?: string | null;
  } | null;
};

// Pull the text out of one inbound event. Voice notes: Kapso may already attach
// a transcript; if not, download the audio and transcribe it ourselves.
async function textoDeEvento(ev: KapsoEvent): Promise<string> {
  const m = ev.message;
  let t = (m?.text?.body ?? m?.kapso?.transcript?.text ?? "").trim();

  if (!t && m?.type === "audio" && m?.kapso?.media_url) {
    const audio = await descargarMedia(m.kapso.media_url);
    if (audio) {
      const mime = m.kapso.media_data?.content_type ?? audio.tipo;
      t = (await transcribirAudio(audio.bytes, mime))?.trim() ?? "";
    }
  }
  if (!t) t = (m?.kapso?.content ?? "").trim();
  return t;
}

// Verification handshake (Kapso/Meta GET) so the webhook can be marked verified.
export async function GET(req: Request) {
  const challenge =
    new URL(req.url).searchParams.get("hub.challenge") ??
    new URL(req.url).searchParams.get("challenge");
  if (challenge) return new Response(challenge, { status: 200 });
  return new Response("ok", { status: 200 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const evento = req.headers.get("x-webhook-event") ?? "";
  const firma = req.headers.get("x-webhook-signature");

  if (!firmaValida(process.env.KAPSO_WEBHOOK_SECRET ?? "", raw, firma)) {
    return new Response("firma inválida", { status: 403 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  if (evento !== "whatsapp.message.received") {
    return new Response(null, { status: 200 });
  }

  // Kapso can buffer rapid messages into a batch — merge them into one turn.
  const esBatch = payload.batch === true && Array.isArray(payload.data);
  const eventos = (esBatch ? payload.data : [payload]) as KapsoEvent[];

  const phoneNumberId = String(
    payload.phone_number_id ??
      eventos[0]?.phone_number_id ??
      process.env.KAPSO_PHONE_NUMBER_ID ??
      "",
  );

  // Extract every event's text in parallel (audio downloads/transcription can
  // be slow), then merge into one turn.
  const partes = await Promise.all(eventos.map((ev) => textoDeEvento(ev)));
  const texto = partes.filter(Boolean).join("\n").trim();

  // A message we cannot read (photo, document, location, a voice note that
  // would not transcribe) still deserves an answer. Reactions and stickers
  // don't: replying to a 👍 with "no pude ver tu archivo" is worse than silence.
  const tipoSinTexto = texto
    ? undefined
    : eventos.map((ev) => ev.message?.type).find((t) => t && t in SIN_TEXTO);

  if (!phoneNumberId || (!texto && !tipoSinTexto)) {
    return new Response(null, { status: 200 });
  }

  // Identity, not phone number. A customer who adopted a @username sends no
  // phone number at all, and this used to drop their message on the floor —
  // silently, and Meta never replays it.
  const remitente = await resolverRemitente(eventos);
  if (!remitente) {
    console.error("Kapso webhook: mensaje sin identificador de remitente");
    return new Response(null, { status: 200 });
  }
  const { clave, telefono, bsuid } = remitente;
  // What goes in the thread: the staff must see that a photo came in.
  const entrada = texto || `[${tipoSinTexto}]`;

  // A human already took over this conversation: pause the bot. Record the
  // customer's message (so history is intact when it returns to the bot), but
  // don't auto-reply over the asesor.
  // Same when the shop switched the agent off (Configuración): the message
  // lands in the bandeja and people answer.
  const [estado, activo] = await Promise.all([estadoConversacion(clave), getAgenteActivo()]);
  if (estado === "asesor" || !activo) {
    await guardarMensaje(clave, "user", entrada);
    return new Response(null, { status: 200 });
  }

  // One number hammering the agent — a loop, another bot, someone probing —
  // costs a model call per message. Past the cap a person takes over, and the
  // pause above keeps the agent quiet until they hand it back.
  if ((await mensajesDelCliente(clave, 60)) >= TOPE_POR_HORA) {
    await guardarMensaje(clave, "user", entrada);
    await marcarAsesor(clave, `Más de ${TOPE_POR_HORA} mensajes en una hora`, entrada);
    await enviarTexto(phoneNumberId, telefono, AL_TOPE, bsuid)
      .then(() => guardarMensaje(clave, "assistant", AL_TOPE))
      .catch((e) => console.error("Kapso webhook: aviso de tope falló:", e));
    return new Response(null, { status: 200 });
  }

  if (!texto) {
    const aviso = SIN_TEXTO[tipoSinTexto!];
    await guardarMensaje(clave, "user", entrada);
    try {
      await enviarTexto(phoneNumberId, telefono, aviso, bsuid);
      await guardarMensaje(clave, "assistant", aviso);
    } catch (err) {
      console.error("Kapso webhook: aviso de mensaje sin texto falló:", err);
    }
    return new Response(null, { status: 200 });
  }

  // For the catch below: what the customer already has, so a late failure
  // neither apologizes after a real answer nor stores their message twice.
  let guardado = false;
  let respondido = false;
  try {
    const [historial, cliente] = await Promise.all([
      cargarHistorial(clave, 10),
      detectarCliente(telefono), // best-effort: null if unregistered
    ]);
    const { texto: respuesta, escalar, fotos, guardar } = await responderMensaje(
      [...historial, { role: "user", content: texto }],
      clave,
      cliente,
    );
    await guardarMensaje(clave, "user", texto);
    guardado = true;
    await guardarMensaje(clave, "assistant", guardar);
    // Send both identifiers: Meta prefers the phone number, which keeps it
    // flowing back to us through the 30-day rule, and falls back to the BSUID
    // for customers whose number we no longer receive.
    await enviarTexto(phoneNumberId, telefono, respuesta, bsuid);
    respondido = true;
    await mandarFotos(phoneNumberId, telefono, clave, fotos, bsuid);

    // Agent asked for a human: pause the bot + ping the asesores (best-effort,
    // WhatsApp only delivers inside the 24h window).
    if (escalar) {
      await marcarAsesor(clave, escalar.motivo, texto);
      const asesores = await getAsesores();
      if (asesores.length) {
        const aviso =
          `🔔 *Un cliente necesita asesor*\n` +
          `Cliente: ${etiqueta(remitente)}\n` +
          `Motivo: ${escalar.motivo}\n` +
          `Último mensaje: "${texto}"\n\n` +
          `Respóndele directo. El bot quedó en pausa con ese cliente; ` +
          `reactívalo en la app (Asesor → Devolver al bot) cuando termines.`;
        await Promise.all(
          asesores.map((a) =>
            enviarTexto(phoneNumberId, a, aviso).catch((e) =>
              console.error("Aviso a asesor falló:", a, e),
            ),
          ),
        );
      }
    }
  } catch (err) {
    console.error("Kapso webhook error:", err);
    // The agent broke: the customer hears so, and a person picks it up. Each
    // step on its own — whatever failed above may fail again here.
    if (!guardado) await guardarMensaje(clave, "user", texto);
    if (!respondido) {
      await enviarTexto(phoneNumberId, telefono, DISCULPA, bsuid)
        .then(() => guardarMensaje(clave, "assistant", DISCULPA))
        .catch((e) => console.error("Kapso webhook: disculpa falló:", e));
    }
    await marcarAsesor(clave, "El agente falló al contestar", texto).catch((e) =>
      console.error("Kapso webhook: no se pudo pasar a asesor:", e),
    );
  }
  return new Response(null, { status: 200 });
}
