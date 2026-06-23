import "server-only";

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
export async function enviarTexto(
  phoneNumberId: string,
  to: string,
  body: string,
): Promise<void> {
  await kapso(`/meta/whatsapp/${META_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    }),
  });
}

// One-time setup: register the inbound-message webhook for a connected number.
// Returns the signing secret to store as KAPSO_WEBHOOK_SECRET.
export async function crearWebhookMensajes(
  phoneNumberId: string,
  webhookUrl: string,
): Promise<{ id: string; secret: string }> {
  const r = await kapso<{ data: { id: string; secret_key?: string; secret?: string } }>(
    `/platform/v1/whatsapp/phone_numbers/${phoneNumberId}/webhooks`,
    {
      method: "POST",
      body: JSON.stringify({
        webhook: {
          url: webhookUrl,
          events: ["whatsapp.message.received"],
          kind: "kapso",
          payload_version: "v2",
          buffer_enabled: true,
          buffer_window_seconds: 5,
          active: true,
        },
      }),
    },
  );
  return { id: r.data.id, secret: r.data.secret_key ?? r.data.secret ?? "" };
}
