import "server-only";
import { generateText, tool, stepCountIs } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import {
  buscarProducto,
  estadoInventario,
  listarInventarios,
} from "@/modules/analytics/queries";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
const MODEL =
  process.env.OPENROUTER_AGENT_MODEL ??
  process.env.OPENROUTER_CHAT_MODEL ??
  "anthropic/claude-sonnet-4.6";

const SYSTEM = `Eres el asistente de WhatsApp de una tienda de celulares y accesorios (Fiable).
Atiendes a clientes que preguntan por PRECIO y EXISTENCIA (stock) de productos.

Reglas:
- Para precio o disponibilidad usa la herramienta buscar_producto (por nombre o SKU).
- Para preguntas generales de inventario usa estado_inventario o listar_inventarios.
- Responde SIEMPRE en español, breve y claro, estilo WhatsApp (sin tablas ni markdown pesado).
- Da el precio en pesos mexicanos y di si hay stock. Si hay varias coincidencias, lista las más relevantes con su precio y stock.
- Al buscar, usa términos concisos tal como los dijo el cliente (modelo y tipo). NO agregues marcas que el cliente no mencionó.
- Si buscar_producto no devuelve resultados, INTENTA DE NUEVO con menos palabras (por ejemplo solo el modelo, o solo el tipo) antes de decir que no hay.
- Si un producto está agotado o no existe tras varios intentos, dilo con claridad y pide una descripción más específica.
- Si el precio es 0, di que el precio aún no está cargado y que un asesor lo confirmará (no digas que cuesta $0).
- No inventes datos ni precios: usa solo lo que devuelven las herramientas.
- No compartas costos ni márgenes con el cliente, solo el precio de venta.`;

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
          "Busca productos por nombre o SKU en todos los inventarios. Devuelve inventario, precio (MXN), stock, categoría, marca.",
        inputSchema: z.object({
          consulta: z.string().describe("nombre o SKU del producto"),
        }),
        execute: async ({ consulta }) => buscarProducto(consulta),
      }),
      estado_inventario: tool({
        description:
          "Resumen del inventario: totales y desglose por inventario, con listas de bajo stock y agotados.",
        inputSchema: z.object({}),
        execute: async () => estadoInventario(),
      }),
      listar_inventarios: tool({
        description:
          "Lista los inventarios disponibles con su número de productos y unidades.",
        inputSchema: z.object({}),
        execute: async () => listarInventarios(),
      }),
    },
  });

  return (
    text.trim() ||
    "Perdón, no pude encontrar esa información. ¿Me das el modelo o SKU exacto?"
  );
}
