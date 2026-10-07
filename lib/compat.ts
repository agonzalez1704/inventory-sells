import "server-only";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { normalize } from "@/lib/search";

// When a model isn't in the catalog, many phone displays are literally the same
// panel across models (shared chassis + flex). Ask Gemini which models share the
// part, then re-search the catalog with those names.

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY! });
// Grounded in a real web search (OpenAI's web_search tool). From memory alone
// the model told a customer a Note 20 Ultra screen fits an S20 Ultra — same
// size class, different panel — and a wrong part is a return and a lost
// customer, so the answer must come from supplier listings.
const MODEL = process.env.OPENAI_COMPAT_MODEL ?? "gpt-4.1-mini";

// Bump when the model or prompt changes so stale cached answers are ignored.
const CACHE_VERSION = "v5";

export type Compat = {
  modelos: string[];
  nota: string | null;
  /**
   * The lookup itself couldn't run (no key, quota exhausted, timeout, garbled
   * answer) — NOT the same as "this model has no compatible screens". Collapsing
   * the two told staff "no compatible models" while an OpenRouter 403 quota
   * error was the real cause, so the UI must be able to say "couldn't check".
   * Non-optional on purpose: every construction site has to decide which it is.
   */
  fallo: boolean;
};

/** Nothing to report, and that's the real answer. */
const SIN_DATOS: Compat = { modelos: [], nota: null, fallo: false };
/** We never got an answer. Callers must not cache or present this as "none". */
const FALLO: Compat = { modelos: [], nota: null, fallo: true };

const SYSTEM = `Eres experto en refacciones de celular en México. Usa la búsqueda web.
Tu trabajo: decir qué OTROS modelos usan EXACTAMENTE la misma pantalla (mismo panel y
flex) que el modelo dado, según listados de proveedores de refacciones ("pantalla
compatible con", "display para X / Y / Z", el mismo número de parte).

Reglas:
- Cada modelo que incluyas DEBE llevar la URL de la página donde lo leíste. Sin
  fuente, no lo incluyas.
- Mismo tamaño o misma familia NO basta: un Galaxy Note 20 Ultra NO comparte
  pantalla con un S20 Ultra. Ante la duda, no lo incluyas. Una lista vacía es una
  respuesta correcta y frecuente.
- Nombre comercial completo con marca. Máximo 8. No incluyas el propio modelo.
- "nota" = una frase corta con la razón (sin URLs).

Responde ÚNICAMENTE con JSON válido, sin texto antes ni después, sin markdown:
{"modelos": [{"modelo": "Marca Modelo", "fuente": "https://..."}], "nota": "..."}`;

/** null = couldn't read an answer out of the response (caller treats as failure). */
function parse(text: string): Compat | null {
  try {
    // The model may wrap the JSON in prose or ``` fences — grab the first
    // balanced {...} object.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    const json = JSON.parse(text.slice(start, end + 1)) as {
      modelos?: unknown;
      nota?: unknown;
    };
    // A model without the page it was read on is a guess: dropped.
    const modelos = Array.isArray(json.modelos)
      ? [
          ...new Set(
            json.modelos
              .filter(
                (m): m is { modelo: string; fuente: string } =>
                  !!m &&
                  typeof m === "object" &&
                  typeof (m as { modelo?: unknown }).modelo === "string" &&
                  /^https?:\/\//.test(String((m as { fuente?: unknown }).fuente ?? "")),
              )
              // Strip any trailing "(code)" the model adds, keep the model name.
              .map((m) => m.modelo.replace(/\s*\([^)]*\)\s*$/, "").trim())
              .filter((m) => m.length > 1),
          ),
        ].slice(0, 8)
      : [];
    const nota = typeof json.nota === "string" ? json.nota.trim() : null;
    return { modelos, nota, fallo: false };
  } catch {
    return null;
  }
}

// Cached lookup. The storefront is public, so identical zero-result searches
// must not each cost a model call.
export async function modelosCompatibles(query: string): Promise<Compat> {
  const norm = normalize(query);
  // Guardrails: a model name is short. Anything else is noise (or abuse) and
  // must never reach the model. Not a failure — there was nothing to look up.
  if (!norm || norm.length < 3 || norm.length > 60) return SIN_DATOS;
  // Missing key IS a failure: we can't answer, so don't claim "no compatibles".
  if (!process.env.OPENAI_API_KEY) {
    console.error("[compat] OPENAI_API_KEY no configurada");
    return FALLO;
  }

  // Versioned key so a model/prompt change ignores older cached answers.
  const key = `${CACHE_VERSION}:${norm}`;
  const { data: cached } = await insforgeAdmin.database
    .from("compat_cache")
    .select("modelos, nota")
    .eq("query", key)
    .maybeSingle();
  if (cached) {
    const c = cached as { modelos: string[] | null; nota: string | null };
    return { modelos: c.modelos ?? [], nota: c.nota, fallo: false };
  }

  let result: Compat | null = null;
  try {
    const { text } = await generateText({
      model: openai.responses(MODEL),
      // Cast: @ai-sdk/openai and ai ship different provider-utils versions, so
      // the provider tool's schema type does not line up; at runtime it is
      // passed straight through to the same provider that made it.
      tools: {
        web_search: openai.tools.webSearch({
          searchContextSize: "high",
          userLocation: { type: "approximate", country: "MX" },
        }),
      } as unknown as Parameters<typeof generateText>[0]["tools"],
      // Offered, the search was skipped and the answer came from memory. Forced
      // — and phrased the way a technician searches — it lands on supplier
      // listings.
      toolChoice: { type: "tool", toolName: "web_search" },
      system: SYSTEM,
      prompt: `pantalla compatible ${query}: ¿qué otros modelos usan el mismo display?`,
      temperature: 0.2,
      maxOutputTokens: 800, // every model now carries its source URL
      abortSignal: AbortSignal.timeout(25_000), // web search is slower
    });
    result = parse(text);
    if (!result) console.error("[compat] respuesta ilegible del modelo:", text.slice(0, 300));
  } catch (e) {
    // Quota, network, timeout. This is the one that bit us: an OpenRouter 403
    // ("Key limit exceeded") surfaced to staff as "no compatible models".
    console.error("[compat] la consulta falló:", e);
    return FALLO;
  }
  // Unreadable answer is a failure too — caching it would freeze a garbled
  // response into a permanent "no compatibles" for that query.
  if (!result) return FALLO;

  // Cache a real answer, empty included — that stops repeat calls for nonsense
  // queries. Failures are never cached, so a retry after the quota is topped up
  // actually re-asks.
  await insforgeAdmin.database
    .from("compat_cache")
    .insert([{ query: key, modelos: result.modelos, nota: result.nota }])
    .then(undefined, () => {});

  return result;
}
