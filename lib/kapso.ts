import "server-only";
import { randomBytes } from "node:crypto";

// Minimal Kapso (WhatsApp) client for a single business. Single connected
// number + webhook secret live in env vars (no multi-tenant onboarding).

const META_VERSION = "v24.0";

function base(): string {
  return process.env.KAPSO_API_BASE_URL || "https://api.kapso.ai";
}

async function kapso<T>(path: string, init?: RequestInit): Promise<T> {
  const key = process.env.KAPSO_API_KEY;
  if (!key) throw new Error("KAPSO_API_KEY no configurado");
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      "X-API-Key": key,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = (json as { error?: { message?: string } })?.error?.message;
    throw new Error(`Kapso ${res.status}: ${err ?? text ?? "error"}`);
  }
  return json as T;
}

// Send a WhatsApp text reply (Meta proxy).
//
// A customer who adopted a @username has no phone number we can address, so the
// recipient goes in `recipient` (their BSUID) instead of `to`. Meta accepts
// both at once and prefers `to`, so we send whatever we have of each.
export async function enviarTexto(
  phoneNumberId: string,
  to: string,
  body: string,
  recipientUserId?: string,
): Promise<void> {
  if (!to && !recipientUserId) throw new Error("Sin destinatario (ni teléfono ni BSUID)");
  await kapso(`/meta/whatsapp/${META_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      ...(to ? { to } : {}),
      ...(recipientUserId ? { recipient: recipientUserId } : {}),
      type: "text",
      text: { body },
    }),
  });
}

// Download an inbound media file (audio note, image) from a Kapso media_url.
// Kapso media URLs require the API key; returns the raw bytes + content type.
export async function descargarMedia(
  url: string,
): Promise<{ bytes: Uint8Array; tipo: string } | null> {
  const key = process.env.KAPSO_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(url, {
      headers: { "X-API-Key": key },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return null;
    const tipo = r.headers.get("content-type") ?? "audio/ogg";
    return { bytes: new Uint8Array(await r.arrayBuffer()), tipo };
  } catch (err) {
    console.error("Descarga de media Kapso falló:", err);
    return null;
  }
}

// One-time setup: register the inbound-message webhook for a connected number.
// Returns the signing secret to store as KAPSO_WEBHOOK_SECRET.
//
// Two things the API is picky about, both of which fail unhelpfully:
// the envelope key is `whatsapp_webhook` (a bare `webhook` returns
// "missing_parameter"), and WE generate the signing secret — omitting it
// returns "Secret key can't be blank" rather than issuing one.
//
// Webhooks are scoped to one phone number, so a sandbox number and a
// production number each need their own, with their own secret.
export async function crearWebhookMensajes(
  phoneNumberId: string,
  webhookUrl: string,
  secret: string = randomBytes(32).toString("hex"),
): Promise<{ id: string; secret: string }> {
  const r = await kapso<{ data: { id: string } }>(
    `/platform/v1/whatsapp/phone_numbers/${phoneNumberId}/webhooks`,
    {
      method: "POST",
      body: JSON.stringify({
        whatsapp_webhook: {
          url: webhookUrl,
          events: ["whatsapp.message.received"],
          kind: "kapso",
          payload_version: "v2",
          buffer_enabled: true,
          buffer_window_seconds: 5,
          active: true,
          secret_key: secret,
        },
      }),
    },
  );
  return { id: r.data.id, secret };
}
