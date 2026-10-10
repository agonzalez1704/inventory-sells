// node --experimental-strip-types scripts/importar-catalogo-ruli.mts "<lista>.xls" > catalogo.sql
// node scripts/sql.mjs --negocio=ruli --file=catalogo.sql
//
// The owner's sheet (Hoja2 of "IA SAE LISTA AZUS") into Ruli's database:
//   A clave · B–F fit 1 (marca, modelo, versión, condición, años)
//   G–J fit 2 (marca, modelo, versión, año) · L sistema · N marca de la pieza
//
// Re-runnable: he keeps filling the sheet. Systems and brands are set where he
// wrote one; a part he gave fits to loses its catalog-derived vehicle tags and
// keeps exactly his (his list is what the WhatsApp agent may quote).
import { createRequire } from "node:module";
import { normalize } from "../lib/search.ts";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const archivo = process.argv[2];
if (!archivo) {
  console.error('Uso: importar-catalogo-ruli.mts "<lista>.xls"');
  process.exit(1);
}
const ANIO_MAX = new Date().getFullYear() + 1;

const SISTEMAS: Record<string, string> = {
  SUSPENSION: "suspension", DIRECCION: "direccion", MOTOR: "motor", FRENOS: "frenos",
  ENFRIAMIENTO: "enfriamiento", COLISION: "colision", ACEITE: "aceite", CLUTCH: "clutch",
  SOPORTES: "soportes", "A/C": "ac", FERRETERIA: "ferreteria", ACCESORIOS: "accesorios",
};
// Typed fast at a counter: the misspellings he actually made.
const MARCAS_VEH: Record<string, string> = { VOLKWAGEN: "Volkswagen", CHEBROLET: "Chevrolet" };
const VERSIONES: Record<string, string> = { VDRIVE: "V-Drive", "2° GENERACION": "2ª generación" };
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

const lit = (v: string | number | null) =>
  v === null ? "NULL" : typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`;

const wb = XLSX.readFile(archivo);
const filas = (XLSX.utils.sheet_to_json(wb.Sheets["Hoja2"], { header: "A", defval: "", raw: false }) as Record<string, string>[]).slice(1);

const prod: string[] = [];
const compat: string[] = [];
let nSis = 0, nMarca = 0, sinAnios = 0;
for (const r of filas) {
  const sku = limpio(r.A);
  if (!sku) continue;
  const sistema = SISTEMAS[sinAcento(limpio(r.L)).toUpperCase()] ?? null;
  const marcaRaw = limpio(r.N).toUpperCase();
  const marca = marcaRaw && !NO_ES_MARCA.has(marcaRaw) ? marcaRaw : null;
  if (sistema) nSis++;
  if (marca) nMarca++;
  if (sistema || marca) prod.push(`(${lit(sku)},${lit(sistema)},${lit(marca)})`);

  for (const [ma, mo, ve, co, an] of [
    [r.B, r.C, r.D, r.E, r.F],
    [r.G, r.H, r.I, "", r.J],
  ]) {
    const marcaV = limpio(ma).toUpperCase();
    const modelo = limpio(mo);
    if (!marcaV || !modelo) continue;
    const vMarca = MARCAS_VEH[marcaV] ?? titulo(marcaV);
    const vModelo = titulo(modelo);
    const verRaw = limpio(ve).toUpperCase();
    const version = verRaw ? (VERSIONES[verRaw] ?? titulo(verRaw)) : null;
    const condicion = limpio(co) || null;
    const [desde, hasta] = anios(limpio(an));
    // A tag is a vehicle only when its name ends in years (the make, model and
    // year columns are parsed out of it), so a fit without years would vanish
    // from every vehicle search. Left as it is until he writes the years.
    if (desde === null) {
      sinAnios++;
      continue;
    }
    // The version is its own column: in the name it would become part of the
    // model ("Versa V-Drive").
    const nombre = `${vMarca} ${vModelo} ${desde === hasta ? desde : `${desde}-${hasta}`}`;
    compat.push(
      `(${[sku, vMarca, vModelo, version, condicion, desde, hasta, nombre, normalize(nombre)].map(lit).join(",")})`,
    );
  }
}

console.error(`sistema: ${nSis} · marca: ${nMarca} · compatibilidades: ${compat.length} · sin años (omitidas): ${sinAnios}`);

console.log(`DO $$
BEGIN
  -- Versa versions, in the owner's words. What was named "2ª generación"
  -- (2012–2019) is the body he calls V-Drive, and "3ª generación" (2020+) is
  -- his "2ª generación"; the 2007–2012 car he does not sell as a Versa.
  UPDATE public.tags
     SET veh_version = CASE veh_version
       WHEN '2ª generación' THEN 'V-Drive'
       WHEN '3ª generación' THEN '2ª generación'
       ELSE NULL END
   WHERE veh_marca = 'Nissan' AND veh_modelo = 'Versa'
     AND veh_version IN ('1ª generación', '2ª generación', '3ª generación');

  CREATE TEMP TABLE imp_prod (sku text, sistema text, marca text) ON COMMIT DROP;
  INSERT INTO imp_prod VALUES
${prod.join(",\n")};
  UPDATE public.products p SET sistema = i.sistema
    FROM imp_prod i WHERE p.sku = i.sku AND i.sistema IS NOT NULL AND p.sistema IS DISTINCT FROM i.sistema;
  UPDATE public.products p SET brand = i.marca
    FROM imp_prod i WHERE p.sku = i.sku AND i.marca IS NOT NULL AND p.brand IS DISTINCT FROM i.marca;

  CREATE TEMP TABLE imp_compat (sku text, marca text, modelo text, version text, condicion text,
    desde int, hasta int, nombre text, norm text) ON COMMIT DROP;
  INSERT INTO imp_compat VALUES
${compat.join(",\n")};

  -- His fits replace the catalog's for the parts he covered.
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

  INSERT INTO public.product_tags (product_id, tag_id, condicion)
  SELECT DISTINCT ON (p.id, t.id) p.id, t.id, c.condicion
    FROM imp_compat c
    JOIN public.products p ON p.sku = c.sku
    JOIN public.tags t ON t.nombre_norm = c.norm
  ON CONFLICT (product_id, tag_id) DO UPDATE SET condicion = EXCLUDED.condicion;
END $$;`);
