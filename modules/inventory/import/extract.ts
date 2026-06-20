import "server-only";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { AIExtractionSchema, type ExtractedRow } from "./schema";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
const MODEL = process.env.OPENROUTER_CHAT_MODEL ?? "anthropic/claude-sonnet-4.6";

const PROMPT = `Extrae el inventario de productos de este documento (lista, hoja o foto).
Devuelve una fila por producto/variante vendible.

Reglas:
- "sku": usa el código/clave del producto si aparece; si no hay, genera un slug corto a partir del nombre (minúsculas, guiones). Nunca lo dejes vacío.
- "name": nombre o descripción del producto.
- "brand" (marca), "size" (talla), "color": solo si aparecen.
- "category": clasifica el producto. Ej: pantalla, bateria, funda, mica, cable, cargador, power-bank, audifonos, accesorio, tenis, otro.
- "attributes": especificaciones propias del producto como pares clave/valor. Ej: [{"key":"modelo","value":"iPhone 13"},{"key":"capacidad","value":"4000 mAh"},{"key":"conector","value":"USB-C"}]. Incluye compatibilidad, capacidad, conector, material, etc. cuando apliquen. Omite si no hay.
- "price": el precio que aparece para el producto, en pesos MXN como número (sin "$" ni comas). Ej: "$1,299.00" -> 1299. No asumas margen ni conviertas.
- "cost": solo si el documento muestra explícitamente un costo separado del precio.
- "quantity": existencia/stock/cantidad como entero, solo si aparece.
- No inventes datos. Omite campos que no estén presentes.
- Ignora encabezados, totales y texto que no sea un producto.`;

async function extract(
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: Uint8Array; mediaType: string }
    | { type: "file"; data: Uint8Array; mediaType: string }
  >,
): Promise<ExtractedRow[]> {
  const { object } = await generateObject({
    model: openrouter(MODEL),
    schema: AIExtractionSchema,
    // Extraction output is small; cap it (cheaper, and avoids the model's
    // 64k default max_tokens tripping OpenRouter credit limits).
    maxOutputTokens: 8192,
    messages: [{ role: "user", content }],
  });
  return object.rows;
}

export async function extractRowsFromImage(
  bytes: Uint8Array,
  mediaType: string,
): Promise<ExtractedRow[]> {
  return extract([
    { type: "text", text: PROMPT },
    { type: "image", image: bytes, mediaType },
  ]);
}

export async function extractRowsFromPdf(
  bytes: Uint8Array,
): Promise<ExtractedRow[]> {
  return extract([
    { type: "text", text: PROMPT },
    { type: "file", data: bytes, mediaType: "application/pdf" },
  ]);
}
