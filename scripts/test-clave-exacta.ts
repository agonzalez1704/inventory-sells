// A part code typed whole ranks first, whatever else shares its numbers.
// node --experimental-strip-types scripts/test-clave-exacta.ts
//
// "10-009" is two tokens, "10" and "009". Parts with both numbers in their NAME
// (model years, ranges) used to outscore the part whose code it is, and with
// enough of them the SQL candidate cap dropped it entirely: Ruli's BRAZO
// COMPENSADOR 10-009 showed under one inventory and "Sin resultados" under
// "Todos". buscar_productos_candidatos now orders an exact code first; this pins
// the scorer to the same rule so the row the SQL keeps is the row shown.
import { CLAVE_EXACTA, scoreProduct, searchProducts } from "../lib/search.ts";

const CATALOGO = [
  { sku: "10-009", name: "BRAZO COMPENSADOR", brand: "TRACK ONE", quantity: 0 },
  // Both numbers in the name, in stock — what used to bury it.
  { sku: "BAL-2210", name: "BALATA DEL 10 AL 009 TSURU 2009 2010", brand: null, quantity: 8 },
  { sku: "AMO-4410", name: "AMORTIGUADOR 10 009 SENTRA 2009-2010", brand: null, quantity: 3 },
  { sku: "10-0091", name: "BRAZO COMPENSADOR LARGO", brand: null, quantity: 2 },
  { sku: "21-037", name: "BRAZO DE CONTROL TRAS SUP IZ BUICK", brand: null, quantity: 0 },
];

let fallas = 0;
const falla = (msg: string) => {
  console.error("✗", msg);
  fallas++;
};

for (const q of ["10-009", "10 009", "10009", "10-009 "]) {
  const primero = searchProducts(CATALOGO, q)[0];
  if (primero?.sku !== "10-009") falla(`"${q}" → primero ${primero?.sku ?? "nada"}, esperaba 10-009`);
  if (scoreProduct(CATALOGO[0], q) !== CLAVE_EXACTA) falla(`"${q}" no cuenta como clave exacta`);
}

// A different code that merely STARTS with the query is not exact.
if (scoreProduct(CATALOGO[3], "10-009") === CLAVE_EXACTA) falla("10-0091 contó como clave exacta de 10-009");

// A word query is untouched by the rule.
if (searchProducts(CATALOGO, "brazo compensador")[0]?.sku !== "10-009") {
  falla('"brazo compensador" dejó de encontrar el compensador');
}

// The other code from the report still works.
if (searchProducts(CATALOGO, "21-037")[0]?.sku !== "21-037") falla("21-037 dejó de salir primero");

if (fallas) process.exit(1);
console.log("✓ clave exacta primero");
