// Prove that moving search into the database did not change what it finds.
// node --env-file=.env.local --experimental-strip-types scripts/test-busqueda.ts
//
// The old path scored the WHOLE catalog in the browser. The new one asks the
// database for candidates (trigram) and scores only those. If the SQL pre-filter
// is stricter than the scorer in any way, products silently stop appearing —
// there is no error, the item just isn't there. So compare the two directly, on
// the real catalog.
import assert from "node:assert/strict";
import { createAdminClient } from "@insforge/sdk";
import { searchProducts, tokensDeConsulta, expand } from "../lib/search.ts";

const db = createAdminClient({
  baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
  apiKey: process.env.INSFORGE_API_KEY!,
}).database;

type Row = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string | null;
  quantity: number;
};

const { data: todos } = await db
  .from("products")
  .select("id, sku, name, brand, category, quantity")
  .eq("is_active", true);
const catalogo = (todos ?? []) as Row[];
console.log(`catálogo: ${catalogo.length} productos\n`);

// Real things people type at the counter, plus the cases the scorer has special
// rules for: brand nicknames both ways, joined spellings, filler words, SKUs.
const CONSULTAS = [
  "iphone 13",
  "iph 13 pro",
  "moto g42",
  "motorola",
  "redmi note 12",
  "xiaomi",
  "samsung a10",
  "bateria iphone",
  "pantalla",
  "hola tienes pantalla de iphone 11",
  "note12",
  "A2655",
  "cobalto",
  "huawei",
];

const tieBreak = (a: Row, b: Row) => Number(b.quantity > 0) - Number(a.quantity > 0);

let fallos = 0;
for (const q of CONSULTAS) {
  const viejo = searchProducts(catalogo, q, { limit: 30, tieBreak }).map((p) => p.id);

  const tokens = tokensDeConsulta(q);
  let candidatos: Row[];
  if (tokens.length === 0) {
    candidatos = catalogo;
  } else {
    const { data, error } = await db.rpc("buscar_productos_candidatos", {
      p_tokens: tokens.map(expand),
      p_inventory_id: null,
      p_categoria: null,
      p_limit: 1000,
    });
    if (error) throw new Error(`${q}: ${error.message}`);
    candidatos = (data ?? []) as Row[];
  }
  const nuevo = searchProducts(candidatos, q, { limit: 30, tieBreak }).map((p) => p.id);

  // What actually has to hold. Comparing the two top-30 lists element by element
  // does NOT: a single broad token ("motorola") scores a hundred products
  // identically, so which 30 surface depends purely on input order, and the old
  // order was whatever the database happened to return. The new order is at
  // least defined (name matches, then sellable stock, then name).
  //
  // The property worth protecting is recall: the pre-filter must never withhold
  // a product the scorer would have matched, because that failure is invisible —
  // the item simply never appears.
  const todosLosMatches = searchProducts(catalogo, q).map((p) => p.id);
  const enCandidatos = new Set(candidatos.map((p) => p.id));
  const perdidos = todosLosMatches.filter((id) => !enCandidatos.has(id));

  const nombre = (id: string) => catalogo.find((p) => p.id === id)?.name ?? id;
  const truncado = candidatos.length >= 1000;
  const mismoTop = nuevo[0] === viejo[0];

  if (perdidos.length > 0) {
    fallos++;
    console.error(
      `✗ "${q}" — el pre-filtro se comió ${perdidos.length} de ${todosLosMatches.length} coincidencias` +
        `\n   ${perdidos.slice(0, 8).map(nombre).join(", ")}`,
    );
  } else {
    const nota = [
      `${todosLosMatches.length} coincidencias`,
      `${candidatos.length} candidatos`,
      mismoTop ? "mismo 1º" : `1º cambió: ${nombre(viejo[0])} → ${nombre(nuevo[0])}`,
      truncado ? "TRUNCADO" : null,
    ]
      .filter(Boolean)
      .join(" · ");
    console.log(`✓ "${q}" — ${nota}`);
  }
}

console.log(
  fallos === 0
    ? "\nRecall intacto: el pre-filtro no oculta nada que el scorer encontraría."
    : `\n${fallos} fallo(s).`,
);
process.exit(fallos ? 1 : 0);
