// The agent's two misses with a part code and a quantity (WhatsApp, 27-nov):
// "DENV0120 tienes?" → "el modelo exacto no lo tengo" (it had 4), and
// "¿Tienes dos?" → "solo tengo una" (it had 2). Pins the pure halves.
// node --experimental-strip-types scripts/test-cantidad-codigo.ts
import { codigosEn, porCodigo, soloModeloExacto } from "../lib/search.ts";

let fallas = 0;
const ok = (c: boolean, msg: string) => c || (console.error("✗", msg), fallas++);

ok(JSON.stringify(codigosEn("DENV0120 tienes?")) === '["denv0120"]', `codigos ${JSON.stringify(codigosEn("DENV0120 tienes?"))}`);
ok(codigosEn("10-367").includes("10367"), "10-367");
ok(codigosEn("K-8695").includes("k8695"), "K-8695");
for (const q of ["pantalla iphone 15", "balero jetta 2009", "a3 1.8", "note12 pro", "tienes dos?"])
  ok(codigosEn(q).length === 0, `"${q}" no es código: ${JSON.stringify(codigosEn(q))}`);

const rows = [
  { sku: "DENV0120", nombre: "ESPIGA L/R DER/IZQ JETTA/GOLF A3 93-98 S/ABS STD/AUT 1.8L/2.0L" },
  { sku: "326585", nombre: "Junta V.C. Ext. Crossfox 06-08" },
];
ok(soloModeloExacto(rows, "DENV0120", (r) => r.nombre) === null, "el filtro por nombre no ve el código (por eso se salta)");
ok(porCodigo(rows, codigosEn("DENV0120 tienes?"), (r) => r.sku)?.[0]?.sku === "DENV0120", "porCodigo encuentra su fila");
ok(porCodigo(rows, ["2526011"], (r) => r.sku) === null, "sin fila propia → null (quedan las conversiones)");

// The forced-search regex lives in the agent; same pattern here.
const PIDE_CANTIDAD =
  /\b(?:tienes|tienen|tiene|hay|habr[aá]|quedan?|ocupo|necesito|quiero|dame|me das|me vendes|son)\s+(?:\d+|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|un par)\b|\bcu[aá]nt[oa]s\s+(?:tienes|tienen|hay|quedan|te quedan|manejas)\b|\b(?:\d+|dos|tres|cuatro|cinco|seis|ocho|diez)\s+(?:piezas|pzas?|juegos)\b/i;
for (const m of ["Tienes dos?", "De esta tienes dos en mostrador?", "¿cuántas hay?", "ocupo 4", "necesito un par"])
  ok(PIDE_CANTIDAD.test(m), `"${m}" pide cantidad`);
for (const m of ["Gracias!", "Este tienes?", "tienes balero?"]) ok(!PIDE_CANTIDAD.test(m), `"${m}" no pide cantidad`);

if (fallas) process.exit(1);
console.log("✓ cantidad y código");
