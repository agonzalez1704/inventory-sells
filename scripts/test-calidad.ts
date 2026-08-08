// The quality heuristic exists twice: lib/calidad.ts reads it in TypeScript,
// and products.calidad recomputes it in SQL as a generated column. Two copies
// of a rule drift, and nothing in the compiler or the database notices — the
// storefront facet would simply start disagreeing with the search filter.
//
// So compare them over the real catalog, every row.
// node --experimental-strip-types scripts/test-calidad.ts [fiable|ruli]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { calidadDe } from "../lib/calidad.ts";

const RAIZ = resolve(import.meta.dirname, "..");
const ACTIVO = resolve(RAIZ, ".insforge/project.json");
const RESPALDO = ACTIVO + ".bak";
const negocio = process.argv[2] ?? "fiable";

const cfgs = JSON.parse(readFileSync(resolve(RAIZ, ".insforge/negocios.json"), "utf8"));
const cfg = cfgs[negocio];
if (!cfg) {
  console.error(`Usa: test-calidad.ts <${Object.keys(cfgs).join("|")}>`);
  process.exit(1);
}

// In pages: 21k rows of JSON in one go overflows the child process buffer.
const PAGINA = 3000;

const habia = existsSync(ACTIVO);
if (habia) copyFileSync(ACTIVO, RESPALDO);
writeFileSync(ACTIVO, JSON.stringify(cfg, null, 2) + "\n");

const filas: { name: string; calidad: string | null }[] = [];
try {
  for (let offset = 0; ; offset += PAGINA) {
    const salida = execFileSync(
      "npx",
      [
        "@insforge/cli",
        "db",
        "query",
        // json_agg so the rows come back parseable instead of as an ASCII table.
        `SELECT coalesce(json_agg(json_build_object('name', name, 'calidad', calidad)), '[]'::json)::text AS j
           FROM (SELECT name, calidad FROM products WHERE is_active
                  ORDER BY name LIMIT ${PAGINA} OFFSET ${offset}) t`,
      ],
      { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    const json = salida.match(/\[[\s\S]*\]/)?.[0];
    if (!json) {
      console.error("No pude leer el catálogo:\n" + salida);
      process.exit(1);
    }
    const lote = JSON.parse(json) as { name: string; calidad: string | null }[];
    filas.push(...lote);
    if (lote.length < PAGINA) break;
  }
} finally {
  if (habia) {
    copyFileSync(RESPALDO, ACTIVO);
    unlinkSync(RESPALDO);
  } else unlinkSync(ACTIVO);
}
const fallos = filas
  .filter((f) => (calidadDe(f.name) ?? null) !== (f.calidad ?? null))
  .slice(0, 20);

console.log(`${negocio}: ${filas.length} productos comparados`);

if (fallos.length) {
  console.error(`\n✗ TS y SQL no coinciden en ${fallos.length}+ productos:\n`);
  for (const f of fallos) {
    console.error(`  ${JSON.stringify(f.name)}  ts=${calidadDe(f.name)} sql=${f.calidad}`);
  }
  process.exit(1);
}

const conCalidad = filas.filter((f) => f.calidad).length;
console.log(`✓ lib/calidad.ts y products.calidad coinciden (${conCalidad} con calidad)`);
