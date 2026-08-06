import "server-only";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
const MODEL = process.env.OPENROUTER_CHAT_MODEL ?? "anthropic/claude-sonnet-4.6";

// A separate prompt from the catalog extractor on purpose.
//
// That one is told: "price" is the price shown, and "cost" only if the document
// shows a cost SEPARATE from the price. A supplier invoice has exactly one money
// column — what you pay — so under those rules the model files it as `price`,
// i.e. the SALE price. Applied to a purchase that means the FIFO layers get no
// cost at all, and if it ever reached the catalog it would overwrite the sale
// price with the supplier's cost. Here, every unit amount is a COST.
const PROMPT = `Extrae las líneas de producto de esta FACTURA o REMISIÓN de proveedor.
Es un documento de COMPRA: lo que el negocio le compró a su proveedor.

Reglas:
- "descripcion": el texto del producto tal como aparece en el documento.
- "sku_proveedor": el código o número de parte que usa el PROVEEDOR, si aparece
  en la línea. Es la columna de clave/código, no la descripción.
- "cantidad": las piezas de esa línea, como entero.
- "costo_unitario": lo que cuesta UNA pieza, en pesos MXN, como número
  (sin "$" ni comas). TODO importe unitario en este documento es un costo, nunca
  un precio de venta. Si la línea sólo muestra el importe total, divídelo entre
  la cantidad.
- "importe": el total de la línea, si aparece.
- No inventes datos. Si un campo no está en el documento, omítelo.
- IGNORA por completo: encabezados, datos fiscales, subtotales, IVA, totales,
  condiciones de pago, leyendas y cualquier fila que no sea un producto.

Además, del documento completo:
- "folio": el número o folio de la factura, si aparece.
- "proveedor": el nombre del proveedor que emite, si aparece.`;

const LineaSchema = z.object({
  descripcion: z.string(),
  sku_proveedor: z.string().optional(),
  cantidad: z.number().optional(),
  costo_unitario: z.number().optional(),
  importe: z.number().optional(),
});

const FacturaSchema = z.object({
  folio: z.string().optional(),
  proveedor: z.string().optional(),
  lineas: z.array(LineaSchema),
});

export type LineaFactura = z.infer<typeof LineaSchema>;
export type FacturaExtraida = z.infer<typeof FacturaSchema>;

async function extraer(
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: Uint8Array; mediaType: string }
    | { type: "file"; data: Uint8Array; mediaType: string }
  >,
): Promise<FacturaExtraida> {
  const { object } = await generateObject({
    model: openrouter(MODEL),
    schema: FacturaSchema,
    maxOutputTokens: 8192,
    messages: [{ role: "user", content }],
  });
  return object;
}

export function extraerFacturaDeImagen(
  bytes: Uint8Array,
  mediaType: string,
): Promise<FacturaExtraida> {
  return extraer([
    { type: "text", text: PROMPT },
    { type: "image", image: bytes, mediaType },
  ]);
}

export function extraerFacturaDePdf(bytes: Uint8Array): Promise<FacturaExtraida> {
  return extraer([
    { type: "text", text: PROMPT },
    { type: "file", data: bytes, mediaType: "application/pdf" },
  ]);
}

/**
 * Unit cost for a line, deriving it from the line total when the document only
 * prints that. Returns null rather than guessing when neither is usable — a
 * fabricated cost would land in a FIFO layer and quietly misstate every margin
 * on those pieces.
 */
export function costoUnitario(l: LineaFactura): number | null {
  if (l.costo_unitario != null && l.costo_unitario >= 0) return l.costo_unitario;
  const qty = l.cantidad ?? 0;
  if (l.importe != null && l.importe >= 0 && qty > 0) return l.importe / qty;
  return null;
}
