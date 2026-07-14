// Validate the Gemini compatible-models prompt against the real catalog.
// node --experimental-strip-types --env-file=.env.local scripts/test-compat.ts
import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createAdminClient } from "@insforge/sdk";
import { searchProducts } from "../lib/search.ts";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
const MODEL = "google/gemini-2.5-flash";

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

const admin = createAdminClient({
  baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
  apiKey: process.env.INSFORGE_API_KEY!,
});
const { data } = await admin.database
  .from("products")
  .select("name, brand, category, sku, quantity")
  .eq("is_active", true);
const products = (data ?? []) as {
  name: string;
  brand: string | null;
  category: string | null;
  sku: string;
  quantity: number;
}[];

for (const q of ["m3 pro 5g", "poco x3 nfc"]) {
  const { text } = await generateText({
    model: openrouter(MODEL),
    system: SYSTEM,
    prompt: `Modelo buscado: "${q}"`,
    temperature: 0.2,
  });
  const clean = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(clean) as { modelos: string[]; nota: string };

  console.log(`\n=== "${q}" ===`);
  console.log("nota:", parsed.nota);
  console.log("modelos:", parsed.modelos);

  const seen = new Set<string>();
  let hits = 0;
  for (const m of parsed.modelos) {
    for (const p of searchProducts(products, m, { limit: 3 })) {
      if (seen.has(p.sku)) continue;
      seen.add(p.sku);
      hits++;
      console.log(`   ✓ [${m}] → ${p.name} (${p.brand}) ${p.sku} · ${p.quantity} disp.`);
    }
  }
  if (hits === 0) console.log("   (ningún compatible en catálogo)");
}
