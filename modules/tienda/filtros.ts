// Storefront filters: one shape shared by the URL, the server page and the
// filter panel. Several values per list filter (OR inside, AND across) — the
// SQL side is tienda_match in migrations/20260915120000.

export type Facet = { value: string; n: number };

export const LISTAS = ["cat", "marca", "cal", "marco", "tag"] as const;
type Lista = (typeof LISTAS)[number];

export type Filtros = Record<Lista, string[]> & {
  vmarca: string | null;
  vmodelo: string | null;
  anio: number | null;
  stock: boolean;
};

export type Facetas = Record<Lista | "vmarca" | "vmodelo" | "anio", Facet[]> & {
  total: number;
  stock: number;
};

export const SIN_FILTROS: Filtros = {
  cat: [], marca: [], cal: [], marco: [], tag: [],
  vmarca: null, vmodelo: null, anio: null, stock: false,
};

type SP = Record<string, string | string[] | undefined>;

const primero = (v: string | string[] | undefined) => [v].flat()[0] || null;

export function leerFiltros(sp: SP): Filtros {
  // Sorted and deduped: the filters are the cache key of the browse reads, so
  // ?marca=A&marca=B and ?marca=B&marca=A must be the same entry.
  const lista = (k: Lista) =>
    [...new Set([sp[k]].flat().filter((v): v is string => Boolean(v)))].sort();
  const vmarca = primero(sp.vmarca);
  // A model without its make, or a year without its model, is a stale link.
  const vmodelo = vmarca ? primero(sp.vmodelo) : null;
  const anio = Number(primero(sp.anio));
  return {
    cat: lista("cat"),
    marca: lista("marca"),
    cal: lista("cal"),
    marco: lista("marco"),
    tag: lista("tag"),
    vmarca,
    vmodelo,
    anio: vmodelo && Number.isInteger(anio) && anio >= 1900 && anio <= 2100 ? anio : null,
    stock: primero(sp.stock) === "1",
  };
}

/** The jsonb the RPCs take: only keys that actually filter. */
export function filtrosSQL(f: Filtros): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of LISTAS) if (f[k].length) o[k] = f[k];
  if (f.vmarca) o.vmarca = f.vmarca;
  if (f.vmodelo) o.vmodelo = f.vmodelo;
  if (f.anio) o.anio = f.anio;
  if (f.stock) o.stock = true;
  return o;
}

export function urlTienda(f: Filtros, q: string): string {
  const sp = new URLSearchParams();
  if (q) sp.set("q", q);
  for (const k of LISTAS) for (const v of f[k]) sp.append(k, v);
  if (f.vmarca) sp.set("vmarca", f.vmarca);
  if (f.vmodelo) sp.set("vmodelo", f.vmodelo);
  if (f.anio) sp.set("anio", String(f.anio));
  if (f.stock) sp.set("stock", "1");
  const s = sp.toString();
  return s ? `/tienda?${s}` : "/tienda";
}

export function cuantosFiltros(f: Filtros): number {
  return (
    LISTAS.reduce((n, k) => n + f[k].length, 0) +
    (f.vmarca ? 1 : 0) + (f.vmodelo ? 1 : 0) + (f.anio ? 1 : 0) + (f.stock ? 1 : 0)
  );
}

export function leerFacetas(filas: unknown): Facetas {
  const rows = (Array.isArray(filas) ? filas : []) as { tipo: string; valor: string | null; n: number | string }[];
  const de = (tipo: string) =>
    rows
      .filter((r) => r.tipo === tipo && r.valor)
      .map((r) => ({ value: r.valor as string, n: Number(r.n) }));
  const num = (tipo: string) => Number(rows.find((r) => r.tipo === tipo)?.n ?? 0);
  return {
    cat: de("cat"), marca: de("marca"), cal: de("cal"), marco: de("marco"), tag: de("tag"),
    vmarca: de("vmarca"), vmodelo: de("vmodelo"), anio: de("anio"),
    total: num("total"),
    stock: num("stock"),
  };
}

export function alternar(lista: string[], v: string): string[] {
  return lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v].sort();
}
