// What an uploaded catalog Excel would change. Pure, so check-excel-catalogo.ts
// can pin the rules: an empty cell never clears anything, and a file downloaded
// and uploaded back untouched changes nothing.

export type FilaActual = {
  sku: string;
  name: string;
  brand: string | null;
  familia: string | null;
  sistema: string | null;
};
export type FilaArchivo = { sku: string; nombre?: string; marca?: string; refaccion?: string; sistema?: string };
export type Opcion = { id: string; nombre: string };
export type Campo = "familia" | "sistema" | "brand";

export type Diferencias = {
  nombres: { sku: string; name: string }[];
  /** "campo|valor" → the SKUs that take it, so they apply in groups. */
  grupos: { campo: Campo; valor: string; skus: string[] }[];
  conteo: { nombres: number; marca: number; refaccion: number; sistema: number };
  noEncontrados: string[];
  desconocidas: string[];
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Row of the sheet → file row. Null when the sheet has no "sku" header. */
export function leerHoja(grid: unknown[][]): FilaArchivo[] | null {
  const cab = grid.slice(0, 5).findIndex((r) => r.some((c) => norm(String(c)) === "sku"));
  if (cab < 0) return null;
  const col = (n: string) => grid[cab].findIndex((c) => norm(String(c)) === n);
  const [sku, nombre, marca, refaccion, sistema] = ["sku", "nombre", "marca", "refaccion", "sistema"].map(col);
  const celda = (r: unknown[], i: number) => (i < 0 ? undefined : String(r[i] ?? "").replace(/\s+/g, " ").trim() || undefined);
  return grid
    .slice(cab + 1)
    .map((r) => ({ sku: celda(r, sku) ?? "", nombre: celda(r, nombre), marca: celda(r, marca), refaccion: celda(r, refaccion), sistema: celda(r, sistema) }))
    .filter((f) => f.sku);
}

export function compararCatalogo(
  archivo: FilaArchivo[],
  actual: Map<string, FilaActual>,
  familias: (Opcion & { sistema: string | null })[],
  sistemas: Opcion[],
): Diferencias {
  const famPorNombre = new Map(familias.map((f) => [norm(f.nombre), f]));
  const famPorId = new Map(familias.map((f) => [f.id, f]));
  const sisPorNombre = new Map(sistemas.flatMap((s) => [[norm(s.nombre), s.id], [norm(s.id), s.id]] as [string, string][]));
  const out: Diferencias = { nombres: [], grupos: [], conteo: { nombres: 0, marca: 0, refaccion: 0, sistema: 0 }, noEncontrados: [], desconocidas: [] };
  const grupos = new Map<string, { campo: Campo; valor: string; skus: string[] }>();
  const desconocidas = new Set<string>();
  const poner = (campo: Campo, valor: string, sku: string) => {
    const k = `${campo}|${valor}`;
    if (!grupos.has(k)) grupos.set(k, { campo, valor, skus: [] });
    grupos.get(k)!.skus.push(sku);
  };

  for (const f of new Map(archivo.map((a) => [a.sku, a])).values()) {
    const cur = actual.get(f.sku);
    if (!cur) {
      out.noEncontrados.push(f.sku);
      continue;
    }
    if (f.nombre && f.nombre !== cur.name.replace(/\s+/g, " ").trim()) {
      out.nombres.push({ sku: f.sku, name: f.nombre });
      out.conteo.nombres++;
    }
    if (f.marca && f.marca.toUpperCase() !== (cur.brand ?? "").toUpperCase()) {
      poner("brand", f.marca.toUpperCase(), f.sku);
      out.conteo.marca++;
    }
    if (f.refaccion) {
      const fam = famPorNombre.get(norm(f.refaccion));
      if (!fam) desconocidas.add(f.refaccion);
      else if (fam.id !== cur.familia) {
        poner("familia", fam.id, f.sku);
        out.conteo.refaccion++;
      }
    }
    if (f.sistema) {
      const sis = sisPorNombre.get(norm(f.sistema));
      // Compared with what the panel shows: the part's own, else its refacción's.
      const efectivo = cur.sistema ?? (cur.familia ? (famPorId.get(cur.familia)?.sistema ?? null) : null);
      if (!sis) desconocidas.add(f.sistema);
      else if (sis !== efectivo) {
        poner("sistema", sis, f.sku);
        out.conteo.sistema++;
      }
    }
  }
  out.grupos = [...grupos.values()];
  out.desconocidas = [...desconocidas].sort();
  return out;
}
