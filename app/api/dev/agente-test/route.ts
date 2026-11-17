import { responderMensaje } from "@/modules/agent/inventory-agent";
import type { Turno } from "@/modules/agent/memoria";

export const maxDuration = 60;

// Runs the WhatsApp agent on a made-up conversation for scripts/test-agente.ts.
// Nothing is sent to WhatsApp, but the agent's tools are real: a search writes
// "piden y no hay", a quote lands in cotizaciones and pings the sellers. So
// this only answers when the server was started on purpose against a named
// test database:
//
//   AGENTE_TEST_DB  a piece of the backend URL this server must be talking to
//                   (the sandbox project's appkey). Unset, or pointing anywhere
//                   else, the route does not exist.
export async function POST(req: Request) {
  const esperada = process.env.AGENTE_TEST_DB?.trim();
  const backend = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_INSFORGE_URL ?? "";
  if (process.env.NODE_ENV === "production" || !esperada || !backend.includes(esperada)) {
    return new Response(null, { status: 404 });
  }
  const { mensajes, clave } = (await req.json()) as { mensajes: Turno[]; clave: string };
  const { texto, escalar } = await responderMensaje(mensajes, clave, null);
  return Response.json({ texto, escala: escalar !== null, motivo: escalar?.motivo ?? null });
}
