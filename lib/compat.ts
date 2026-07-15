import "server-only";
import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { normalize } from "@/lib/search";

// When a model isn't in the catalog, many phone displays are literally the same
// panel across models (shared chassis + flex). Ask Gemini which models share the
// part, then re-search the catalog with those names.

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
// ":online" enables OpenRouter's web-search plugin — without it the model
// answers from stale parametric memory and wrongly calls many screens "unique"
// (e.g. Honor X7b, which actually shares its panel with the Honor 90/20 Smart).
// Web-grounded compat needs a model that reasons over supplier listings — the
// conservative flash model wrongly calls screens "unique". Sonnet:online cites
// real repair suppliers (matches Honor X7b ↔ Honor 90/20 Smart).
const MODEL = `${
  process.env.OPENROUTER_COMPAT_MODEL ??
  process.env.OPENROUTER_WEB_MODEL ??
  "anthropic/claude-sonnet-4.6"
}:online`;

// Bump when the model or prompt changes so stale cached answers are ignored.
const CACHE_VERSION = "v3";

export type Compat = { modelos: string[]; nota: string | null };

const EMPTY: Compat = { modelos: [], nota: null };

const SYSTEM = `Eres experto en refacciones/pantallas de celular en México. BUSCA EN LA WEB.
Los proveedores de pantallas agrupan modelos que usan EXACTAMENTE el mismo display
(mismo panel y flex), aunque el fabricante no lo documente — a veces con el mismo
número de parte/código. Tu trabajo es devolver ese grupo de compatibilidad de
REFACCIÓN.

Reglas:
- Incluye submodelos y equivalencias entre marcas/series que compartan pantalla
  (ej. Honor X7b comparte display con Honor 90 Smart y Honor 20 Smart; Redmi/Poco
  suelen compartir).
- Apóyate en listados de proveedores: "pantalla compatible con", "display
  compatible", el código de la placa (ej. CLK-LX1/2/3).
- Nombre comercial completo con marca. Máximo 8. No incluyas el propio modelo.
- Solo si de verdad no existe compatibilidad, devuelve lista vacía.
- "nota" = una frase corta con la razón (sin URLs).

Responde ÚNICAMENTE con JSON válido, sin texto antes ni después, sin markdown:
{"modelos": ["Marca Modelo", ...], "nota": "..."}`;

function parse(text: string): Compat {
  try {
    // The model may wrap the JSON in prose or ``` fences — grab the first
    // balanced {...} object.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) return EMPTY;
    const json = JSON.parse(text.slice(start, end + 1)) as {
      modelos?: unknown;
      nota?: unknown;
    };
    const modelos = Array.isArray(json.modelos)
      ? json.modelos
          .filter((m): m is string => typeof m === "string" && m.trim().length > 1)
          // Strip any trailing "(code)" the model adds, keep the model name.
          .map((m) => m.replace(/\s*\([^)]*\)\s*$/, "").trim())
          .slice(0, 8)
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
  const norm = normalize(query);
  // Guardrails: a model name is short. Anything else is noise (or abuse) and
  // must never reach the model.
  if (!norm || norm.length < 3 || norm.length > 60) return EMPTY;
  if (!process.env.OPENROUTER_API_KEY) return EMPTY;

  // Versioned key so a model/prompt change ignores older cached answers.
  const key = `${CACHE_VERSION}:${norm}`;
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
      maxOutputTokens: 600, // web-grounded answers include more reasoning
      abortSignal: AbortSignal.timeout(25_000), // web search is slower
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
