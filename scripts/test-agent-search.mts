import assert from "node:assert/strict";
import { searchProducts } from "../lib/search.ts";

const catalogo = [
  {
    sku: "MOT-E22I-ORG",
    name: "E22 / E22 I",
    brand: "MOTOROLA",
    category: "Pantallas",
  },
];

const resultados = searchProducts(
  catalogo,
  "buenas tardes, tienes display de moto e22i",
);

assert.deepEqual(
  resultados.map((producto) => producto.sku),
  ["MOT-E22I-ORG"],
  "una pregunta natural por display Moto E22i debe encontrar 'E22 / E22 I' de Motorola",
);

console.log("✓ búsqueda del agente: display Moto E22i");

// "Pantalla de iPhone 16" is the 16 — not the 16 E, Plus, Pro or Pro Max.
import { soloModeloExacto } from "../lib/search.ts";
const iphone16 = [
  "16 E HD INCELL", "16 FULL HD INCELL", "16 HD INCELL +", "16 OLED",
  "16 PRO MAX HD INCELL", "16 PRO MAX OLED", "16 PRO OLED",
  "Flex conversion iPhone 16e", "Flex MEP iPhone 16/16 Plus", "Mep-Iph16pro",
].map((name) => ({ name }));
const nombres = (rows: { name: string }[] | null) => (rows ?? []).map((r) => r.name);
assert.deepEqual(nombres(soloModeloExacto(iphone16, "pantalla iphone 16", (r) => r.name)), ["16 FULL HD INCELL", "16 OLED", "Flex MEP iPhone 16/16 Plus"]);
assert.deepEqual(nombres(soloModeloExacto(iphone16, "iphone 16 pro", (r) => r.name)), ["16 PRO OLED", "Mep-Iph16pro"]);
assert.deepEqual(nombres(soloModeloExacto(iphone16, "16 pro max", (r) => r.name)), ["16 PRO MAX HD INCELL", "16 PRO MAX OLED"]);
assert.deepEqual(nombres(soloModeloExacto(iphone16, "iphone 16e", (r) => r.name)), ["16 E HD INCELL", "Flex conversion iPhone 16e"]);
assert.deepEqual(nombres(soloModeloExacto(iphone16, "16 plus", (r) => r.name)), ["16 HD INCELL +", "Flex MEP iPhone 16/16 Plus"]);
// A row naming several models matches by any of them.
const sam = [{ name: "SAM A04E / A02S / A03" }, { name: "A03 CORE" }];
assert.deepEqual(nombres(soloModeloExacto(sam, "a03", (r) => r.name)), ["SAM A04E / A02S / A03"]);
assert.deepEqual(nombres(soloModeloExacto(sam, "a03 core", (r) => r.name)), ["A03 CORE"]);
assert.deepEqual(nombres(soloModeloExacto(sam, "a02s", (r) => r.name)), ["SAM A04E / A02S / A03"]);
// No model number, or no exact model: no opinion.
assert.equal(soloModeloExacto(iphone16, "iphone x", (r) => r.name), null);
assert.equal(soloModeloExacto(iphone16, "iphone 16 mini", (r) => r.name), null);
console.log("✓ búsqueda del agente: solo el modelo exacto");
