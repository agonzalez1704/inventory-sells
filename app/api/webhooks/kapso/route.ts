import { createHmac, timingSafeEqual } from "node:crypto";
import { responderMensaje } from "@/modules/agent/inventory-agent";
import { cargarHistorial, guardarMensaje } from "@/modules/agent/memoria";
import { transcribirAudio } from "@/modules/agent/transcribir";
import { estadoConversacion, marcarAsesor } from "@/modules/agent/handoff";
import { getAsesores } from "@/modules/config/lib";
import { enviarTexto, descargarMedia } from "@/lib/kapso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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
  conversation?: { phone_number?: string };
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

  const numero =
    eventos.find((ev) => ev.conversation?.phone_number)?.conversation
      ?.phone_number ?? "";

  // Extract every event's text in parallel (audio downloads/transcription can
  // be slow), then merge into one turn.
  const partes = await Promise.all(eventos.map((ev) => textoDeEvento(ev)));
  const texto = partes.filter(Boolean).join("\n").trim();

  if (!phoneNumberId || !numero || !texto) {
    return new Response(null, { status: 200 });
  }

  // A human already took over this conversation: pause the bot. Record the
  // customer's message (so history is intact when it returns to the bot), but
  // don't auto-reply over the asesor.
  if ((await estadoConversacion(numero)) === "asesor") {
    await guardarMensaje(numero, "user", texto);
    return new Response(null, { status: 200 });
  }

  try {
    const historial = await cargarHistorial(numero, 10);
    const { texto: respuesta, escalar } = await responderMensaje([
      ...historial,
      { role: "user", content: texto },
    ]);
    await guardarMensaje(numero, "user", texto);
    await guardarMensaje(numero, "assistant", respuesta);
    await enviarTexto(phoneNumberId, numero, respuesta);

    // Agent asked for a human: pause the bot + ping the asesores (best-effort,
    // WhatsApp only delivers inside the 24h window).
    if (escalar) {
      await marcarAsesor(numero, escalar.motivo, texto);
      const asesores = await getAsesores();
      if (asesores.length) {
        const aviso =
          `🔔 *Un cliente necesita asesor*\n` +
          `Cliente: ${numero}\n` +
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
  }
  return new Response(null, { status: 200 });
}
