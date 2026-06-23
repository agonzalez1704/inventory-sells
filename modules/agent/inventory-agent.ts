import "server-only";
import { generateText, tool, stepCountIs } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { buscarProducto } from "@/modules/analytics/queries";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
const MODEL =
  process.env.OPENROUTER_AGENT_MODEL ??
  process.env.OPENROUTER_CHAT_MODEL ??
  "anthropic/claude-sonnet-4.6";

const SYSTEM = `Eres el asistente de WhatsApp de una tienda de celulares y accesorios (Fiable).
Atiendes a clientes que preguntan por PRECIO y DISPONIBILIDAD de productos.

Reglas:
- Usa la herramienta buscar_producto (por nombre o SKU) para responder.
- Al buscar, usa términos concisos tal como los dijo el cliente (modelo y tipo). NO agregues marcas que el cliente no mencionó.
- Si buscar_producto no devuelve resultados, INTENTA DE NUEVO con menos palabras (solo el modelo, o solo el tipo) antes de decir que no hay.
- NUNCA digas cantidades ni números de stock. Solo indica si está DISPONIBLE o AGOTADO (usa el campo "disponible").
- Da el precio en pesos mexicanos. Si el precio es 0, di que el precio aún no está cargado y que un asesor lo confirmará (no digas que cuesta $0).
- Responde SIEMPRE en español, breve y claro, estilo WhatsApp (sin tablas ni markdown pesado).
- Si tras varios intentos no existe, dilo y pide una descripción más específica (modelo, marca).
- No inventes datos ni precios: usa solo lo que devuelven las herramientas.`;

// Generate a WhatsApp reply for an incoming customer message.
export async function responderMensaje(texto: string): Promise<string> {
  const { text } = await generateText({
    model: openrouter(MODEL),
    system: SYSTEM,
    prompt: texto,
    maxOutputTokens: 600,
    stopWhen: stepCountIs(5),
    tools: {
      buscar_producto: tool({
        description:
          "Busca productos por nombre o SKU. Devuelve precio (MXN) y si está disponible (no la cantidad).",
        inputSchema: z.object({
          consulta: z.string().describe("nombre o SKU del producto"),
        }),
        // Customer-facing: expose availability only — never the quantity or cost.
        execute: async ({ consulta }) => {
          const rows = await buscarProducto(consulta);
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
