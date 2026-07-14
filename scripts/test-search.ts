// Sanity-check the shared product search against the real catalog.
// node --experimental-strip-types --env-file=.env.local scripts/test-search.ts
import { createAdminClient } from "@insforge/sdk";
import { searchProducts } from "../lib/search.ts";

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
console.log(`catálogo: ${products.length} productos\n`);

const QUERIES = [
  "moto g42",
  "redmi note 7",
  "note12",
  "iphone 13",
  "sam a05",
  "samsung a05",
  "galaxy a05",
  "xiaomi note 12 pro",
  "poco m3 pro 5g",
  "m3 pro 5g",
  "honor x7a",
  "nova y90",
  "g42",
];

for (const q of QUERIES) {
  const hits = searchProducts(products, q, { limit: 4 });
  const label = hits.length === 0 ? "✗ 0 RESULTADOS" : `✓ ${hits.length}`;
  console.log(`"${q}" → ${label}`);
  for (const h of hits) console.log(`    ${h.name}  [${h.brand ?? "-"}]  ${h.sku}`);
  console.log("");
}
