// node --experimental-strip-types scripts/importar-catalogo-ruli.mts "<lista>.xls" [sin-anios.csv] > catalogo.sql
// then run each "-- @@"-separated block: node scripts/sql.mjs --negocio=ruli --file=<block>.sql
//
// The owner's sheet ("IA SAE LISTA FORMATO FINAL", Hoja2) into Ruli's database.
// One vehicle per row:
//   A clave · B armadora · C modelo · D versión · E cilindrada · F condición
//   G años · I sistema · J refacción · K marca de la pieza
// A row with no clave is one more vehicle for the clave above it, and a blank
// armadora repeats the one above (BEAT under CHEVROLET's SPARK). Línea (L) is
// no longer a filter and is ignored; prices and stock stay the app's.
//
// Loaded once ("de un jalón"); from then on the owner edits in the app. Still
// re-runnable: sistema, refacción and marca are set where he wrote one, and a
// part he gave vehicles to loses its other vehicle tags and keeps exactly his.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { normalize } from "../lib/search.ts";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const archivo = process.argv[2];
const reporte = process.argv[3];
if (!archivo) {
  console.error('Uso: importar-catalogo-ruli.mts "<lista>.xls" [sin-anios.csv]');
  process.exit(1);
}
const ANIO_MAX = new Date().getFullYear() + 1;

const SISTEMAS: Record<string, string> = {
  SUSPENSION: "suspension", DIRECCION: "direccion", MOTOR: "motor", FRENOS: "frenos",
  ENFRIAMIENTO: "enfriamiento", COLISION: "colision", ACEITE: "aceite", CLUTCH: "clutch",
  SOPORTES: "soportes", "A/C": "ac", FERRETERIA: "ferreteria", ACCESORIOS: "accesorios",
};
// His refacciones that ARE an existing family; the rest become families of
// their own, named his way.
const FAMILIA_EXISTENTE: Record<string, string> = {
  AMORTIGUADOR: "amortiguador", "BASE AMORTIGUADOR": "base_amort", HORQUILLA: "horquilla",
  CREMALLERA: "cremallera", BOMBA: "bomba", BALATAS: "balata", BARRA: "barra", BIELETA: "bieleta",
  MAZA: "maza", ROTULA: "rotula", TERMINAL: "terminal", RADIADOR: "radiador", BANDA: "banda",
  VARILLA: "varilla", FLECHA: "flecha", REPUESTO: "kit",
  // Same thing written twice.
  "JUNTA HOMOCINETICA": "juntas_homocineticas",
};
// Typed fast at a counter: the misspellings he actually made.
const MARCAS_VEH: Record<string, string> = { VOLKWAGEN: "Volkswagen", CHEBROLET: "Chevrolet" };
const VERSIONES: Record<string, string> = { VDRIVE: "V-Drive", "II GENERACION": "2ª generación", "2° GENERACION": "2ª generación" };
// Not a part brand: where he bought it.
const NO_ES_MARCA = new Set(["MERCADO LIBRE"]);

const limpio = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ");
const sinAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
// "NP-300" and "G3" keep their capitals; words become Title Case.
const titulo = (s: string) =>
  s
    .split(" ")
    .map((w) => (/\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");

function anios(texto: string): [number | null, number | null] {
  const m = /(\d{4})(?:\s*-\s*(\d{4}))?/.exec(texto);
  if (!m) return [null, null];
  const desde = Number(m[1]);
  // "2012-2029": he means "to this day", not a car from the future.
  const hasta = Math.min(Number(m[2] ?? m[1]), ANIO_MAX);
  return [desde, Math.max(desde, hasta)];
}
const esAnios = (s: string) => /^\d{4}(\s*-\s*\d{4})?$/.test(s);

const lit = (v: string | number | null) =>
  v === null ? "NULL" : typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`;

const wb = XLSX.readFile(archivo);
const filas = (XLSX.utils.sheet_to_json(wb.Sheets["Hoja2"], { header: "A", defval: "", raw: false }) as Record<string, string>[]).slice(1);

const prod: string[] = [];
const compat: string[] = [];
const sinAniosCsv: string[] = ["clave,armadora,modelo,version,cilindrada,condicion"];
const familiasNuevas = new Map<string, { nombre: string; sistemas: Map<string, number> }>();
let nSis = 0, nMarca = 0, nRef = 0, sinAnios = 0;
let clave = "";
let armadora = "";
for (const r of filas) {
  const sku = limpio(r.A);
  if (sku) {
    clave = sku;
    armadora = "";
    const sistema = SISTEMAS[sinAcento(limpio(r.I)).toUpperCase()] ?? null;
    const refRaw = sinAcento(limpio(r.J)).toUpperCase();
    let familia: string | null = null;
    if (refRaw) {
      familia = FAMILIA_EXISTENTE[refRaw] ?? normalize(refRaw).replace(/ /g, "_");
      if (!FAMILIA_EXISTENTE[refRaw] || familia === "juntas_homocineticas") {
        const f = familiasNuevas.get(familia) ?? { nombre: titulo(refRaw === "JUNTA HOMOCINETICA" ? "JUNTAS HOMOCINETICAS" : refRaw), sistemas: new Map() };
        if (sistema) f.sistemas.set(sistema, (f.sistemas.get(sistema) ?? 0) + 1);
        familiasNuevas.set(familia, f);
      }
    }
    const marcaRaw = limpio(r.K).toUpperCase();
    const marca = marcaRaw && !NO_ES_MARCA.has(marcaRaw) ? marcaRaw : null;
    if (sistema) nSis++;
    if (marca) nMarca++;
    if (familia) nRef++;
    if (sistema || marca || familia) prod.push(`(${[sku, sistema, marca, familia].map(lit).join(",")})`);
  }
  if (!clave) continue;

  const modelo = limpio(r.C);
  if (!modelo) continue;
  const marcaV = limpio(r.B).toUpperCase() || armadora;
  if (!marcaV) continue;
  armadora = marcaV;
  const vMarca = MARCAS_VEH[marcaV] ?? titulo(marcaV);
  const vModelo = titulo(modelo);
  const verRaw = limpio(r.D).toUpperCase();
  const version = verRaw ? (VERSIONES[verRaw] ?? titulo(verRaw)) : null;
  const cilindrada = limpio(r.E).toUpperCase() || null;
  let condicion = limpio(r.F) || null;
  let aniosTxt = limpio(r.G);
  // A few years were typed one column early, in condición.
  if (!aniosTxt && condicion && esAnios(condicion)) {
    aniosTxt = condicion;
    condicion = null;
  }
  const [desde, hasta] = anios(aniosTxt);
  // A tag is a vehicle only when its name ends in years, so a fit without
  // them would vanish from every vehicle search. Reported for him to finish
  // in the app.
  if (desde === null) {
    sinAnios++;
    sinAniosCsv.push([clave, vMarca, vModelo, version ?? "", cilindrada ?? "", condicion ?? ""].map((x) => `"${x.replace(/"/g, '""')}"`).join(","));
    continue;
  }
  // The version is its own column: in the name it would become part of the
  // model ("Versa V-Drive").
  const nombre = `${vMarca} ${vModelo} ${desde === hasta ? desde : `${desde}-${hasta}`}`;
  compat.push(
    `(${[clave, vMarca, vModelo, version, cilindrada, condicion, desde, hasta, nombre, normalize(nombre)].map(lit).join(",")})`,
  );
}

if (reporte) writeFileSync(reporte, sinAniosCsv.join("\n") + "\n");
console.error(
  `sistema: ${nSis} · refacción: ${nRef} · marca: ${nMarca} · vehículos: ${compat.length} · sin años (omitidos): ${sinAnios} · refacciones nuevas: ${familiasNuevas.size}`,
);

const familias = [...familiasNuevas].map(([id, f]) => {
  const sistema = [...f.sistemas].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  // '^$' never matches a product name: these are chosen, not derived.
  return `(${[id, f.nombre, "^$", 5, sistema].map(lit).join(",")})`;
});

// Several blocks, each small enough for the CLI's argument and each safe to
// re-run. A part's vehicles all travel in one block, so a part is never left
// half-replaced. Blocks are separated by a "-- @@" line.
const trozos = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const bloques: string[] = [];

bloques.push(`INSERT INTO public.familias (id, nombre, patron, orden, sistema) VALUES
${familias.join(",\n")}
ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, sistema = coalesce(public.familias.sistema, EXCLUDED.sistema);`);

for (const t of trozos(prod, 2500)) {
  bloques.push(`DO $$
BEGIN
  CREATE TEMP TABLE imp_prod (sku text, sistema text, marca text, familia text) ON COMMIT DROP;
  INSERT INTO imp_prod VALUES
${t.join(",\n")};
  UPDATE public.products p SET sistema = i.sistema
    FROM imp_prod i WHERE p.sku = i.sku AND i.sistema IS NOT NULL AND p.sistema IS DISTINCT FROM i.sistema;
  UPDATE public.products p SET brand = i.marca
    FROM imp_prod i WHERE p.sku = i.sku AND i.marca IS NOT NULL AND p.brand IS DISTINCT FROM i.marca;
  UPDATE public.products p SET familia = i.familia, familia_fija = true
    FROM imp_prod i WHERE p.sku = i.sku AND i.familia IS NOT NULL
     AND (p.familia IS DISTINCT FROM i.familia OR NOT p.familia_fija);
END $$;`);
}

// Vehicles grouped by part, then cut into blocks of whole parts.
const porSku = new Map<string, string[]>();
for (const c of compat) {
  const sku = c.slice(2, c.indexOf("',"));
  porSku.set(sku, [...(porSku.get(sku) ?? []), c]);
}
for (const grupo of trozos([...porSku.values()], 300)) {
  bloques.push(`DO $$
BEGIN
  CREATE TEMP TABLE imp_compat (sku text, marca text, modelo text, version text, cilindrada text,
    condicion text, desde int, hasta int, nombre text, norm text) ON COMMIT DROP;
  INSERT INTO imp_compat VALUES
${grupo.flat().join(",\n")};

  -- His vehicles replace the catalog's for the parts he covered.
  DELETE FROM public.product_tags pt
   USING public.products p, public.tags t
   WHERE pt.product_id = p.id AND pt.tag_id = t.id AND t.veh_marca IS NOT NULL
     AND p.sku IN (SELECT sku FROM imp_compat);

  INSERT INTO public.tags (nombre, nombre_norm, veh_version)
  SELECT DISTINCT ON (norm) nombre, norm, version FROM imp_compat
  ON CONFLICT (nombre_norm) DO NOTHING;
  -- A band he named carries his version, also when the tag already existed.
  UPDATE public.tags t SET veh_version = c.version
    FROM (SELECT DISTINCT ON (norm) norm, version FROM imp_compat WHERE version IS NOT NULL) c
   WHERE t.nombre_norm = c.norm AND t.veh_version IS DISTINCT FROM c.version;

  INSERT INTO public.product_tags (product_id, tag_id, condicion, cilindrada)
  SELECT DISTINCT ON (p.id, t.id) p.id, t.id, c.condicion, c.cilindrada
    FROM imp_compat c
    JOIN public.products p ON p.sku = c.sku
    JOIN public.tags t ON t.nombre_norm = c.norm
  ON CONFLICT (product_id, tag_id) DO UPDATE
    SET condicion = EXCLUDED.condicion, cilindrada = EXCLUDED.cilindrada;
END $$;`);
}

console.log(bloques.join("\n-- @@\n"));
