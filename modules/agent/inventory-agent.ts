import "server-only";
import { generateText, tool, stepCountIs } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { buscarProducto } from "@/modules/analytics/queries";
import { getNegocioInfo } from "@/modules/config/lib";
import type { Turno } from "./memoria";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
const MODEL =
  process.env.OPENROUTER_AGENT_MODEL ??
  process.env.OPENROUTER_CHAT_MODEL ??
  "anthropic/claude-sonnet-4.6";

const SYSTEM = `Eres el asistente de WhatsApp de una tienda de celulares y accesorios (Fiable).
Atiendes a clientes que preguntan por PRECIO y DISPONIBILIDAD de productos, y por datos del negocio (envíos, pagos, ubicación, etc.).

Reglas de productos:
- Usa la herramienta buscar_producto (por nombre o SKU) para precio y disponibilidad.
- Usa términos concisos como los dijo el cliente. NO agregues marcas que no mencionó.
- Si el cliente pregunta EN GENERAL (una marca o tipo SIN modelo, p. ej. "¿manejas pantallas de Xiaomi?"), o si la herramienta responde "demasiados", NO listes productos: confirma corto que SÍ y pregunta el MODELO. Ej: "¡Sí! ¿Qué modelo de Xiaomi buscas?".
- Solo da disponibilidad detallada cuando el cliente dé un MODELO concreto (pocas coincidencias). NUNCA mandes listas largas.
- Si no hay resultados, intenta de nuevo con menos palabras antes de decir que no hay.
- NUNCA digas cantidades ni números de stock. Solo "Disponible" o "Agotado" (campo "disponible").
- Da el precio en pesos. Si el precio es 0, di que aún no está cargado y un asesor lo confirma (no digas $0).

Reglas de conversación:
- MANTÉN EL CONTEXTO: el historial de la conversación viene en los mensajes. Si el cliente dice "la OLED" o "el segundo", se refiere a lo que ya hablaron; NO vuelvas a pedir datos que ya tienes.
- Responde SIEMPRE en español, breve y claro, estilo WhatsApp.

Datos del negocio (envíos, pagos, transferencia, Uber, ubicación, horario):
- Responde SOLO con la "Información del negocio" de abajo. Si la pregunta no está cubierta ahí, di que un asesor lo confirma; no inventes.`;

export async function responderMensaje(messages: Turno[]): Promise<string> {
  const info = await getNegocioInfo();
  const system = info
    ? `${SYSTEM}\n\n=== Información del negocio ===\n${info}`
    : `${SYSTEM}\n\n(No hay información del negocio configurada; para envíos/pagos/ubicación di que un asesor lo confirma.)`;

  const { text } = await generateText({
    model: openrouter(MODEL),
    system,
    messages,
    maxOutputTokens: 600,
    stopWhen: stepCountIs(5),
    tools: {
      buscar_producto: tool({
        description:
          "Busca productos por nombre o SKU. Devuelve precio (MXN) y si está disponible (no la cantidad).",
        inputSchema: z.object({
          consulta: z.string().describe("nombre o SKU del producto"),
        }),
        // Customer-facing: availability only — never the quantity or cost.
        execute: async ({ consulta }) => {
          const rows = await buscarProducto(consulta);
          // Too broad (brand/category, not a specific model): don't dump a list —
          // tell the agent to ask the customer for the exact model.
          if (rows.length > 6) {
            return {
              demasiados: true,
              total: rows.length,
              nota: "Demasiadas coincidencias. NO listes productos: pregunta al cliente el modelo específico.",
            };
          }
          return rows.map((r) => ({
            nombre: r.nombre,
            categoria: r.categoria,
            marca: r.marca,
            color: r.color,
            talla: r.talla,
            precio_mxn: r.precio_mxn,
            disponible: r.stock > 0,
          }));
        },
      }),
    },
  });

  return (
    text.trim() ||
    "Perdón, no pude encontrar esa información. ¿Me das el modelo o SKU exacto?"
  );
}
