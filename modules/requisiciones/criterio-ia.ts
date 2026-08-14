import "server-only";
import { generateObject } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { z } from "zod";
import { sanear, type Criterio } from "./criterio";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
const MODEL = process.env.OPENROUTER_CHAT_MODEL ?? "anthropic/claude-sonnet-4.6";

/**
 * The part of a requisition that is not arithmetic.
 *
 * Quantities and the list itself come from SQL, and deliberately so. This asks
 * the model only the two questions the numbers cannot answer:
 *
 *   1. A part that has been at zero for weeks sold nothing, so its rate is 0 and
 *      the formula proposes ordering none of it — the stockout feeds itself. The
 *      only signal left is the name: a current phone model is worth restocking,
 *      a phone nobody repairs any more is not. That is reading, not counting.
 *
 *   2. Substitutes. "A32 OLED C/M" and "A32 INCELL" are two ways to do the same
 *      repair; the rate treats them as unrelated products and will propose both.
 *      Spotting that needs someone who knows the names mean the same screen.
 *
 * The model never sees an id and never returns one — it works in row numbers,
 * which are mapped back here. A hallucinated uuid would be a line ordered
 * against the wrong part; a hallucinated row number cannot resolve at all.
 */

const PROMPT = `Eres el comprador de una tienda de refacciones para celulares
(pantallas, baterías, piezas). Estás revisando una requisición de compra que ya
fue calculada con el ritmo de venta.

Tu trabajo es SOLO el criterio que los números no pueden dar. No recalcules
cantidades de las piezas que sí tienen ritmo de venta: ésas ya están resueltas.

1. PIEZAS AGOTADAS SIN HISTORIAL ("candidatas"): están en cero y no registran
   ventas. Puede ser porque no se venden, o porque llevan semanas agotadas y por
   eso no pudieron venderse. Decide por el MODELO que nombra la pieza:
   - Modelo vigente o todavía común en reparación → surtir, con una cantidad
     conservadora (1 a 3 piezas). Es una apuesta, no un pedido en firme.
   - Modelo viejo, descontinuado o muy raro → no surtir.
   Si el nombre no te dice lo suficiente, NO surtir: sobra inventario muerto
   antes que faltar una pieza que nadie pidió.

2. SUSTITUTOS: agrupa las filas que resuelven la MISMA reparación en el mismo
   modelo de teléfono, aunque sean calidades distintas (OLED, INCELL, HD, AAA,
   ORG, C/M). Pedir dos calidades del mismo display suele ser doble pedido.
   Sólo agrupa lo que de verdad es el mismo teléfono y la misma pieza. Modelos
   distintos NO se agrupan aunque se parezcan los nombres.

Reglas duras:
- Usa únicamente los números de fila que se te dan.
- "motivo" en una línea corta, en español, para que el comprador entienda por
  qué lo dices. Sin relleno.
- Si no hay nada que agrupar, "sustitutos" va vacío.`;

const Schema = z.object({
  candidatas: z.array(
    z.object({
      fila: z.number().int(),
      surtir: z.boolean(),
      qty: z.number().int().min(0).max(20),
      motivo: z.string(),
    }),
  ),
  sustitutos: z.array(
    z.object({
      filas: z.array(z.number().int()).min(2),
      motivo: z.string(),
    }),
  ),
});


type Fila = {
  sku: string;
  nombre: string;
  existencia: number;
  ritmo_semanal: number;
  sugerido: number;
  /** True for the ones with no rate to go on — the model's actual question. */
  candidata: boolean;
};

export async function pedirCriterio(filas: Fila[]): Promise<Criterio> {
  const candidatas = filas
    .map((f, i) => ({ ...f, fila: i }))
    .filter((f) => f.candidata);

  // Nothing blind and nothing to compare: the model would have no question to
  // answer, and an empty call still costs a round trip.
  if (candidatas.length === 0 && filas.length < 2) {
    return { candidatas: [], sustitutos: [] };
  }

  const tabla = filas
    .map(
      (f, i) =>
        `${i}. ${f.sku} · ${f.nombre} — en existencia ${f.existencia}, ` +
        `ritmo ${f.ritmo_semanal}/sem, sugerido ${f.sugerido}` +
        (f.candidata ? "  [CANDIDATA: agotada sin historial]" : ""),
    )
    .join("\n");

  const { object } = await generateObject({
    model: openrouter(MODEL),
    schema: Schema,
    prompt: `${PROMPT}\n\nFilas de la requisición:\n${tabla}`,
  });

  return sanear(object, filas.length, candidatas.map((c) => c.fila));
}
