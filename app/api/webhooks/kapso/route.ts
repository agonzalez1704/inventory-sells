import { createHmac, timingSafeEqual } from "node:crypto";
import { responderMensaje } from "@/modules/agent/inventory-agent";
import { enviarTexto } from "@/lib/kapso";

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
    kapso?: { content?: string; transcript?: { text?: string } };
  };
  conversation?: { phone_number?: string };
};

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

  let numero = "";
  const partes: string[] = [];
  for (const ev of eventos) {
    if (ev.conversation?.phone_number) numero = ev.conversation.phone_number;
    const t =
      ev.message?.text?.body ??
      ev.message?.kapso?.transcript?.text ??
      ev.message?.kapso?.content ??
      "";
    if (t) partes.push(t);
  }
  const texto = partes.join("\n").trim();

  if (!phoneNumberId || !numero || !texto) {
    return new Response(null, { status: 200 });
  }

  try {
    const respuesta = await responderMensaje(texto);
    await enviarTexto(phoneNumberId, numero, respuesta);
  } catch (err) {
    console.error("Kapso webhook error:", err);
  }
  return new Response(null, { status: 200 });
}
