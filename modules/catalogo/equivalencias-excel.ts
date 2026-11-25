// The owner's table of equivalencias (CNV.xlsx): one row per part, one column
// per brand — "Codigo GROB", "Codigo SYD", "VAZLO", "YOKOMITSU"… Pure, so
// scripts/test-equivalencias.ts can pin the rules.
//
// A node is (marca, clave). Every number of a row is the same part, and rows
// that share a node are one part too (Grob 6709053 and its Línea S 6709053-S
// both list SYD 7000425). The database keeps the result as one grupo per node;
// see migrations/20261125120000_equivalencias.sql.

export type Nodo = { marca: string; clave: string };
export type FilaEquivalencia = Nodo & { grupo: string; origen: "excel" | "manual" };
export type Actual = FilaEquivalencia;

export type Resumen = {
  renglones: number;
  grupos: number;
  /** Groups that keep an id already in the system (same part as before). */
  gruposQueSiguen: number;
  porMarca: { marca: string; claves: number }[];
  /** Numbers the system has from an earlier Excel that this file drops. */
  quitadas: number;
  manuales: number;
};

// Header → marca. "Codigo GROB" → GROB; the owner spells Baslo "VAZLO" and SYD
// is sometimes said "SID".
const ALIAS: Record<string, string> = { VAZLO: "BASLO", BAZLO: "BASLO", VASLO: "BASLO", SID: "SYD", YOKO: "YOKOMITSU" };

export function marcaDeEncabezado(h: unknown): string | null {
  const t = String(h ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/\b(CODIGO|COD|CLAVE|NUMERO|NUM|NO|DE|PARTE)\b\.?/g, " ")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  return ALIAS[t] ?? ALIAS[t.replace(/ /g, "")] ?? t;
}

/** Same rule as the SQL column equivalencias.compacta and the search: 10-009 = 10009. */
export const compactar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const llave = (n: Nodo) => `${n.marca}|${compactar(n.clave)}`;

/** A cell may hold several numbers: "SANG0111 / SANG0121". Excel numbers come as numbers. */
function claves(celda: unknown): string[] {
  if (celda === null || celda === undefined) return [];
  const s = String(celda);
  return s
    .split(/[\/,;]|\s{2,}/)
    .map((x) => x.replace(/\s+/g, " ").trim().toUpperCase())
    .filter((x) => compactar(x) !== "");
}

/** Sheet (first row = headers) → the nodes of each row. Null if no column names a brand. */
export function leerEquivalencias(grid: unknown[][]): { marcas: string[]; renglones: Nodo[][] } | null {
  const cab = grid.findIndex((r) => r.some((c) => marcaDeEncabezado(c)));
  if (cab < 0) return null;
  const marcas = grid[cab].map(marcaDeEncabezado);
  if (!marcas.some(Boolean)) return null;
  const renglones = grid
    .slice(cab + 1)
    .map((r) => marcas.flatMap((m, i) => (m ? claves(r[i]).map((clave) => ({ marca: m, clave })) : [])))
    .filter((r) => r.length > 0);
  return { marcas: [...new Set(marcas.filter((m): m is string => Boolean(m)))], renglones };
}

/**
 * Rows + what the system has → the full table to publish. Manual links are
 * kept and merged in; a group reuses the id it already had when any of its
 * numbers was there, so products that don't change part don't change group.
 */
export function armarTabla(
  renglones: Nodo[][],
  actual: Actual[],
  nuevoId: () => string,
): { filas: FilaEquivalencia[]; resumen: Resumen } {
  const padre = new Map<string, string>();
  const raiz = (x: string): string => {
    let r = x;
    while (padre.get(r) !== r) r = padre.get(r)!;
    // Path compression.
    while (x !== r) {
      const p = padre.get(x)!;
      padre.set(x, r);
      x = p;
    }
    return r;
  };
  const unir = (a: string, b: string) => {
    const ra = raiz(a);
    const rb = raiz(b);
    if (ra !== rb) padre.set(ra, rb);
  };
  const nodo = new Map<string, FilaEquivalencia>();
  const agregar = (n: Nodo, origen: "excel" | "manual") => {
    const k = llave(n);
    if (!padre.has(k)) padre.set(k, k);
    const ya = nodo.get(k);
    if (!ya) nodo.set(k, { ...n, grupo: "", origen });
    else if (origen === "manual") ya.origen = "manual";
    return k;
  };

  for (const r of renglones) {
    const ks = r.map((n) => agregar(n, "excel"));
    for (const k of ks.slice(1)) unir(ks[0], k);
  }
  // Manual links: their old grupo is what ties them together.
  const manualesPorGrupo = new Map<string, string[]>();
  for (const a of actual.filter((a) => a.origen === "manual")) {
    const k = agregar(a, "manual");
    manualesPorGrupo.set(a.grupo, [...(manualesPorGrupo.get(a.grupo) ?? []), k]);
  }
  for (const ks of manualesPorGrupo.values()) for (const k of ks.slice(1)) unir(ks[0], k);

  // Old ids, so an unchanged part keeps its group.
  const grupoViejo = new Map(actual.map((a) => [llave(a), a.grupo]));
  const idDe = new Map<string, string>();
  const usados = new Set<string>();
  const llaves = [...nodo.keys()].sort();
  for (const k of llaves) {
    const r = raiz(k);
    const viejo = grupoViejo.get(k);
    if (!idDe.has(r) && viejo && !usados.has(viejo)) {
      idDe.set(r, viejo);
      usados.add(viejo);
    }
  }
  let siguen = 0;
  for (const r of new Set(llaves.map(raiz))) {
    if (idDe.has(r)) siguen++;
    else idDe.set(r, nuevoId());
  }

  const filas = llaves.map((k) => ({ ...nodo.get(k)!, grupo: idDe.get(raiz(k))! }));
  const porMarca = new Map<string, number>();
  for (const f of filas) porMarca.set(f.marca, (porMarca.get(f.marca) ?? 0) + 1);
  return {
    filas,
    resumen: {
      renglones: renglones.length,
      grupos: idDe.size,
      gruposQueSiguen: siguen,
      porMarca: [...porMarca].map(([marca, n]) => ({ marca, claves: n })).sort((a, b) => b.claves - a.claves),
      quitadas: actual.filter((a) => a.origen === "excel" && !nodo.has(llave(a))).length,
      manuales: filas.filter((f) => f.origen === "manual").length,
    },
  };
}
