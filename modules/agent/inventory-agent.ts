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

// Web-search (OpenRouter ":online") lookup of which other phone models share
// the same display as `modelo`, so we can match the customer's model to a
// compatible product we actually stock.
async function modelosCompatibles(modelo: string): Promise<string[]> {
  const webModel = `${process.env.OPENROUTER_WEB_MODEL ?? MODEL}:online`;
  try {
    const { text } = await generateText({
      model: openrouter(webModel),
      system:
        "Eres experto en refacciones de celulares. Dado un modelo, lista TODOS los modelos cuyo display/pantalla es físicamente intercambiable (el mismo display sirve en todos), incluyendo equivalencias entre marcas (Oppo, Realme, OnePlus, etc.). Responde SOLO los nombres de los modelos separados por coma, sin explicación ni códigos.",
      prompt: `Modelos con pantalla compatible/intercambiable con ${modelo}:`,
      maxOutputTokens: 250,
    });
    return text
      .split(/[,\n]/)
      .map((s) => s.replace(/^[-*\d.\s]+/, "").trim())
      .filter((s) => s.length >= 2 && s.length < 40)
      .slice(0, 12);
  } catch {
    return [];
  }
}

const SYSTEM = `Eres el asistente de WhatsApp de una tienda de celulares y accesorios (Fiable).
Atiendes a clientes que preguntan por PRECIO y DISPONIBILIDAD de productos, y por datos del negocio (envíos, pagos, ubicación, etc.).

Reglas de productos:
- Usa la herramienta buscar_producto (por nombre o SKU) para precio y disponibilidad.
- Usa términos concisos como los dijo el cliente. NO agregues marcas que no mencionó.
- Si el cliente pregunta EN GENERAL (una marca o tipo SIN modelo, p. ej. "¿manejas pantallas de Xiaomi?"), o si la herramienta responde "demasiados", NO listes productos: confirma corto que SÍ y pregunta el MODELO. Ej: "¡Sí! ¿Qué modelo de Xiaomi buscas?".
- Solo da disponibilidad detallada cuando el cliente dé un MODELO concreto (pocas coincidencias). NUNCA mandes listas largas.
- Si no hay resultados, intenta de nuevo con menos palabras antes de decir que no hay.
- Si aún no lo encuentras, usa buscar_compatibilidad: muchas pantallas sirven para VARIOS modelos. Si hay una pantalla compatible disponible, ofrécela y explica la compatibilidad (ej: "La pantalla del Oppo A79 es la misma que la del Realme 11 5G, y esa sí la tenemos disponible").
- NUNCA digas cantidades ni números de stock. Solo "Disponible" o "Agotado" (campo "disponible").
- Da el precio en pesos. Si el precio es 0 (no cargado): di que SÍ la tenemos disponible y que el precio exacto te lo confirma un asesor; SIGUE atendiendo normal. Esto NO es motivo para pasar_a_asesor.

Abreviaturas en los nombres de productos:
- "C/M" = con marco · "S/M" = sin marco.
- Si el cliente pide "con marco" o "sin marco", corresponde a C/M o S/M; búscalo y filtra por eso.
- Al mostrar un producto con "C/M" dilo como "con marco" (y "S/M" como "sin marco").

Formato de respuesta (suena humano, no robot):
- NUNCA uses tablas ni el carácter "|". WhatsApp no las renderiza y se ven como basura. Habla en frases naturales, no en columnas.
- Di disponibilidad y precio en una frase. Ej: "La tenemos en calidad original en $230." El "la tenemos" YA implica que está disponible; NO agregues "Disponible" ni una columna de disponibilidad.
- Si hay varias calidades/opciones, una frase corta o una línea por cada una. Ej: "La tenemos en original a $230 y en calidad estándar a $180."
- Si está agotada, dilo simple: "Esa por ahora no la tengo."
- Negritas de WhatsApp con UN solo asterisco (*así*), nunca dobles (**así**). Emojis con moderación, máximo uno o dos.

Reglas de conversación:
- MANTÉN EL CONTEXTO: el historial de la conversación viene en los mensajes. Si el cliente dice "la OLED" o "el segundo", se refiere a lo que ya hablaron; NO vuelvas a pedir datos que ya tienes.
- Responde SIEMPRE en español, breve y claro, estilo WhatsApp.

Datos del negocio (envíos, pagos, transferencia, Uber, ubicación, horario):
- Responde SOLO con la "Información del negocio" de abajo. Si la pregunta no está cubierta ahí, di que un asesor lo confirma; no inventes.

Cuándo pasar a un asesor (ÚSALA POCO — tu trabajo es contestar, no derivar):
- REGLA #1: SIEMPRE responde primero la disponibilidad (y el precio si lo tienes). NUNCA contestes solo "un asesor te atiende" sin antes buscar el producto y decir si está disponible.
- Llama pasar_a_asesor SOLO si: el cliente quiere apartar/separar/comprar/pagar, pide hablar con una persona, o es garantía/cambio/reclamo.
- NO la llames por: precio en $0 (di "sí, disponible; el precio te lo confirma un asesor" y sigue tú), producto no encontrado (pide el modelo o SKU exacto, NO derives), ni dudas del negocio (contesta con la info de abajo, o di que un asesor confirma SIN usar la herramienta).
- Cuando SÍ la uses, dile al cliente cálido y breve que un asesor lo atiende en seguida (nada técnico).`;

export type RespuestaAgente = {
  texto: string;
  escalar: { motivo: string } | null;
};

export async function responderMensaje(
  messages: Turno[],
): Promise<RespuestaAgente> {
  const info = await getNegocioInfo();
  const system = info
    ? `${SYSTEM}\n\n=== Información del negocio ===\n${info}`
    : `${SYSTEM}\n\n(No hay información del negocio configurada; para envíos/pagos/ubicación di que un asesor lo confirma.)`;

  // Set by the pasar_a_asesor tool if the agent decides it needs a human.
  let escalar: { motivo: string } | null = null;

  const { text } = await generateText({
    model: openrouter(MODEL),
    system,
    messages,
    maxOutputTokens: 600,
    stopWhen: stepCountIs(5),
    tools: {
      pasar_a_asesor: tool({
        description:
          "Marca la conversación para que una PERSONA cierre la venta. Úsala SOLO cuando el cliente quiere apartar/separar/comprar/pagar, pide hablar con una persona, o es garantía/cambio/reclamo. NO la uses por precio en $0 ni porque no encontraste un producto: en esos casos contesta tú dando la disponibilidad.",
        inputSchema: z.object({
          motivo: z
            .string()
            .describe(
              "razón breve, ej: 'cliente quiere apartar pantalla iPhone 13' o 'pide hablar con una persona'",
            ),
        }),
        execute: async ({ motivo }) => {
          escalar = { motivo };
          return {
            ok: true,
            nota: "Listo, un asesor tomará la conversación. Dile al cliente, cálido y breve, que un asesor lo atenderá en seguida.",
          };
        },
      }),
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
      buscar_compatibilidad: tool({
        description:
          "Úsala SOLO cuando buscar_producto no encontró el modelo exacto. Busca en internet con qué otros modelos comparte pantalla y revisa cuáles de esos tenemos en inventario.",
        inputSchema: z.object({
          modelo: z.string().describe("modelo del celular, ej: Oppo A79 5G"),
        }),
        execute: async ({ modelo }) => {
          const compatibles = await modelosCompatibles(modelo);
          const vistos = new Set<string>();
          const encontrados: {
            nombre: string;
            marca: string | null;
            precio_mxn: number;
            disponible: boolean;
          }[] = [];
          for (const m of [modelo, ...compatibles]) {
            const rows = await buscarProducto(m);
            for (const r of rows) {
              if (vistos.has(r.nombre)) continue;
              vistos.add(r.nombre);
              encontrados.push({
                nombre: r.nombre,
                marca: r.marca,
                precio_mxn: r.precio_mxn,
                disponible: r.stock > 0,
              });
              if (encontrados.length >= 8) break;
            }
            if (encontrados.length >= 8) break;
          }
          return { modelo, modelos_compatibles: compatibles, encontrados };
        },
      }),
    },
  });

  return {
    texto:
      text.trim() ||
      "Perdón, no pude encontrar esa información. ¿Me das el modelo o SKU exacto?",
    escalar,
  };
}
