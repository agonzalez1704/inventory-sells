import "server-only";
import { generateObject } from "ai";
import { modeloIA, opcionesIA } from "@/lib/ia";
import { z } from "zod";


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

Además, del documento completo (del encabezado y del pie, no de las líneas):
- "folio": el número o folio de la factura, si aparece.
- "proveedor": el nombre del proveedor que EMITE la factura (no el cliente al
  que se factura), si aparece.
- "rfc_emisor": el RFC de quien emite, si aparece.
- "fecha_emision": la fecha de la factura, en formato AAAA-MM-DD.
- "fecha_vencimiento": la fecha de vencimiento o límite de pago, AAAA-MM-DD, si aparece.
- "dias_credito": los días de crédito si las condiciones los dicen ("90 DIAS" → 90).
- "total": el TOTAL a pagar de la factura, con IVA, como número.`;

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
  rfc_emisor: z.string().optional(),
  fecha_emision: z.string().optional(),
  fecha_vencimiento: z.string().optional(),
  dias_credito: z.number().optional(),
  total: z.number().optional(),
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
    model: modeloIA,
    providerOptions: opcionesIA,
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
