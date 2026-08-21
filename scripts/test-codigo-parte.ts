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
  // Same SHN prefix, and the NAME mentions an 07 model year. These flooded the
  // register when "SHN 07" was read as two independent tokens: sixty control
  // arms for other cars, on top of the codes the seller asked for.
  { sku: "SHNC2603", name: "HORQ INF DER C/ROT C/B SILVERADO 07-18 1500", brand: null },
  { sku: "SHNN3201", name: "HORQ INF DER C/ROT C/BUJES ALTIMA 07-12 2.5L", brand: null },
  { sku: "SHNH0311", name: "HORQ INF DER C/ROT C/BUJES CR-V 07-11 2.4L", brand: null },
  { sku: "SHNN1401", name: "HORQ INF DER C/ROT C/BUJES SENTRA 07-12 B-16", brand: null },
  // Ends in 07 without being the 07 family — an anchored rule must skip it.
  { sku: "SHNC2607", name: "HORQ INF IZQ INVENTADA PARA LA PRUEBA", brand: null },
  { sku: "FILTR0088", name: "FILTRO ACEITE VERSA 12-19", brand: null },
  // The hyphenated world: storefront skus. "iphone 12" parses as a part code
  // (letters + number), and before the separator was allowed in the regex the
  // rule killed every display — while the batteries, whose sku does not start
  // with "iphone", dodged the rule and matched normally. The customer searched
  // "iphone 12" and saw only batteries.
  { sku: "iphone-12-12-pro-oled", name: "12 / 12 PRO OLED", brand: "IPHONE" },
  { sku: "iphone-12-mini-incell", name: "12 MINI INCELL", brand: "IPHONE" },
  { sku: "bat-iph-12-cobalto", name: "BAT IPH 12 (2do) - COBALTO", brand: "Three Suns" },
  { sku: "iphone-13-oled", name: "13 OLED", brand: "IPHONE" },
  // The single-letter models. "iphone x" must find the X — not every iPhone
  // with the X buried under the batteries by alphabetical tie — and must NOT
  // leak into XR/XS, which is why a 1-char token may only match exactly.
  { sku: "iphone-x-incell-negro", name: "X INCELL", brand: "IPHONE" },
  { sku: "iphone-xr-incell-negro", name: "XR INCELL", brand: "IPHONE" },
  { sku: "iphone-xs-max-oled", name: "XS MAX OLED", brand: "IPHONE" },
];

const casos: { q: string; espera: string[]; nota: string }[] = [
  {
    q: "iphone x",
    espera: ["iphone-x-incell-negro"],
    nota: "la letra suelta es el discriminador: solo el X, ni XR ni XS ni pilas",
  },
  {
    q: "iphone 12",
    espera: ["iphone-12-12-pro-oled", "iphone-12-mini-incell", "bat-iph-12-cobalto"],
    nota: "marca + número debe traer displays Y pilas — el 13 no",
  },
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

// The single-letter discriminator, pinned as EXCLUSION — the subset check
// above cannot see this failure. With the "x" dropped by the tokenizer,
// "iphone x" matched every iPhone and the X drowned under the batteries by
// alphabetical tie; the report read "no sale nada".
{
  const traidos = CATALOGO.filter((p) => scoreProduct(p, "iphone x") > 0).map((p) => p.sku);
  const ruido = traidos.filter((sku) => sku.startsWith("iphone-") && !sku.startsWith("iphone-x-"));
  if (ruido.length) {
    fallos++;
    console.error(`✗ "iphone x" trae de más: ${ruido.join(", ")}`);
  } else {
    console.log(`✓ "iphone x" no arrastra XR/XS ni otros modelos`);
  }
}

// The reported noise, pinned: a code search must not match a model year in the
// name. This is the whole difference between "SHN 07" being useful and being a
// wall of parts for other cars.
for (const q of ["shn07", "shn 07", "shn-07", "shn*07"]) {
  const ruido = CATALOGO.filter((p) => scoreProduct(p, q) > 0).filter(
    (p) => !/^shn[a-z]*07/.test(p.sku.toLowerCase()),
  );
  if (ruido.length) {
    fallos++;
    console.error(`✗ "${q}" trajo por año de modelo: ${ruido.map((p) => p.sku).join(", ")}`);
  } else {
    console.log(`✓ "${q}" no trae nada por el año del nombre`);
  }
}

// A name-and-year search is not a code search and must keep working.
if (!CATALOGO.filter((p) => scoreProduct(p, "sentra 07") > 0).some((p) => p.sku === "SHNN1401")) {
  fallos++;
  console.error("✗ \"sentra 07\" dejó de encontrar la Sentra por nombre");
} else {
  console.log("✓ \"sentra 07\" sigue encontrando por nombre y año");
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
