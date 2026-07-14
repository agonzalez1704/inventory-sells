import "server-only";
import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { normalize } from "@/lib/search";

// When a model isn't in the catalog, many phone displays are literally the same
// panel across models (shared chassis + flex). Ask Gemini which models share the
// part, then re-search the catalog with those names.

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
const MODEL = process.env.OPENROUTER_COMPAT_MODEL ?? "google/gemini-2.5-flash";

export type Compat = { modelos: string[]; nota: string | null };

const EMPTY: Compat = { modelos: [], nota: null };

const SYSTEM = `Eres experto en refacciones de celulares (pantallas/displays) en México.
Dado un modelo de celular, lista OTROS modelos cuya PANTALLA es intercambiable al 100%
(mismo panel, mismo chasis, mismo flex de conexión).

Reglas:
- Solo modelos realmente compatibles. Si no estás seguro, no lo incluyas.
- Usa el nombre comercial completo con marca (ej: "Xiaomi Redmi Note 10 5G").
- Máximo 8 modelos.
- Si no hay ninguno compatible, devuelve una lista vacía.
- "nota" = una frase corta explicando por qué son compatibles (o por qué no hay).

Responde SOLO con JSON válido, sin markdown:
{"modelos": ["Marca Modelo", ...], "nota": "..."}`;

function parse(text: string): Compat {
  try {
    const clean = text
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();
    const json = JSON.parse(clean) as { modelos?: unknown; nota?: unknown };
    const modelos = Array.isArray(json.modelos)
      ? json.modelos
          .filter((m): m is string => typeof m === "string" && m.trim().length > 1)
          .slice(0, 8)
          .map((m) => m.trim())
      : [];
    const nota = typeof json.nota === "string" ? json.nota.trim() : null;
    return { modelos, nota };
  } catch {
    return EMPTY;
  }
}

// Cached lookup. The storefront is public, so identical zero-result searches
// must not each cost a model call.
export async function modelosCompatibles(query: string): Promise<Compat> {
  const key = normalize(query);
  // Guardrails: a model name is short. Anything else is noise (or abuse) and
  // must never reach the model.
  if (!key || key.length < 3 || key.length > 60) return EMPTY;
  if (!process.env.OPENROUTER_API_KEY) return EMPTY;

  const { data: cached } = await insforgeAdmin.database
    .from("compat_cache")
    .select("modelos, nota")
    .eq("query", key)
    .maybeSingle();
  if (cached) {
    const c = cached as { modelos: string[] | null; nota: string | null };
    return { modelos: c.modelos ?? [], nota: c.nota };
  }

  let result = EMPTY;
  try {
    const { text } = await generateText({
      model: openrouter(MODEL),
      system: SYSTEM,
      prompt: `Modelo buscado: "${query}"`,
      temperature: 0.2,
      maxOutputTokens: 300, // the answer is a short JSON list — cap the cost
      abortSignal: AbortSignal.timeout(15_000),
    });
    result = parse(text);
  } catch (e) {
    console.error("modelosCompatibles failed:", e);
    return EMPTY;
  }

  // Cache even an empty answer — it stops repeat calls for nonsense queries.
  await insforgeAdmin.database
    .from("compat_cache")
    .insert([{ query: key, modelos: result.modelos, nota: result.nota }])
    .then(undefined, () => {});

  return result;
}
