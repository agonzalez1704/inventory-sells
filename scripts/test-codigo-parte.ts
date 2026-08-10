// A part code typed without its sub-family letter has to find the family.
// node --experimental-strip-types scripts/test-codigo-parte.ts
//
// The counter reads "SHN07" off a shelf; the ERP stores SHNA0711. As a plain
// substring the first is in none of the second, and the register answered "Sin
// resultados" for a part it had four of.
//
// This runs on fixed rows rather than the database, so it keeps working when
// the catalogue changes — and it pins the two halves of the rule together: the
// SQL pre-filter narrows by expand(), the scorer ranks by scoreProduct(), and
// if either stops honouring the code the other's work is invisible.
import { expand, scoreProduct, tokensDeConsulta } from "../lib/search.ts";

const CATALOGO = [
  { sku: "SHNA0711", name: "HORQUILLAS INF DER C/ROTULA C/BUJES", brand: null },
  { sku: "SHNA0712", name: "HORQUILLA INF IZQ C/ROTULA C/BUJES", brand: null },
  { sku: "SHNA0701", name: "HORQ INF DER C/ROT C/BUJES SOUL 16-19", brand: null },
  { sku: "SHNC4501", name: "HORQUILLA INF DER ALUMINIO C/ROTULA", brand: null },
  { sku: "SHNA0112", name: "HORQ INF DER RIO 16-17", brand: null },
  { sku: "OP-03712101GA", name: "BOMBA DE AGUA POINTER", brand: null },
  { sku: "FILTR0088", name: "FILTRO ACEITE VERSA 12-19", brand: null },
];

const casos: { q: string; espera: string[]; nota: string }[] = [
  {
    q: "shn07",
    espera: ["SHNA0711", "SHNA0712", "SHNA0701"],
    nota: "el código sin la letra de subfamilia — el caso reportado",
  },
  {
    q: "shna07",
    espera: ["SHNA0711", "SHNA0712", "SHNA0701"],
    nota: "el código completo sigue funcionando",
  },
  { q: "shn45", espera: ["SHNC4501"], nota: "otra subfamilia, misma regla" },
  {
    q: "shn 07",
    espera: ["SHNA0711", "SHNA0712", "SHNA0701"],
    nota: "separado con espacio",
  },
  {
    q: "shn-07",
    espera: ["SHNA0711", "SHNA0712", "SHNA0701"],
    nota: "separado con guion — normalize() lo vuelve un espacio",
  },
  {
    q: "shn*07",
    espera: ["SHNA0711", "SHNA0712", "SHNA0701"],
    nota: "separado con asterisco — el mismo token que las otras dos",
  },
  {
    q: "shna 07",
    espera: ["SHNA0711", "SHNA0712", "SHNA0701"],
    nota: "con la letra y separado: acota a la subfamilia A",
  },
  { q: "shna0712", espera: ["SHNA0712"], nota: "un código exacto no se diluye" },
  { q: "filtro aceite", espera: ["FILTR0088"], nota: "la búsqueda por palabras no cambia" },
];

let fallos = 0;

for (const { q, espera, nota } of casos) {
  const hallados = CATALOGO.filter((p) => scoreProduct(p, q) > 0).map((p) => p.sku);
  const faltan = espera.filter((sku) => !hallados.includes(sku));
  if (faltan.length) {
    fallos++;
    console.error(`✗ "${q}" (${nota})\n    faltan: ${faltan.join(", ")}\n    trajo:  ${hallados.join(", ") || "nada"}`);
  } else {
    console.log(`✓ "${q}" → ${hallados.join(", ")}  · ${nota}`);
  }
}

// The pre-filter must hand the scorer these rows, or it never sees them.
const patrones = tokensDeConsulta("shn07").flatMap(expand);
if (!patrones.some((t) => t.includes("%"))) {
  fallos++;
  console.error(`✗ expand() no produjo un patrón para el pre-filtro SQL: ${patrones.join(", ")}`);
} else {
  console.log(`✓ el pre-filtro SQL recibe: ${patrones.join(", ")}`);
}

// Writing the letter must still narrow: "shna 07" is the A family, not every
// sub-family whose number starts 07. Losing this makes the separator pointless.
if (CATALOGO.filter((p) => scoreProduct(p, "shna 07") > 0).some((p) => !p.sku.startsWith("SHNA"))) {
  fallos++;
  console.error("✗ \"shna 07\" trajo subfamilias que no son A");
} else {
  console.log("✓ \"shna 07\" se queda dentro de la subfamilia A");
}

// A code the shop does not carry must still come back empty.
if (CATALOGO.some((p) => scoreProduct(p, "zzz99") > 0)) {
  fallos++;
  console.error("✗ un código inexistente devolvió resultados");
} else {
  console.log("✓ un código inexistente sigue sin resultados");
}

if (fallos) process.exit(1);
console.log("\n✓ el código de parte encuentra su familia, con o sin la letra");
