"use server";

import { attempt, type ActionResult } from "@/lib/errors";
import { buscarModelos } from "./busqueda";
import { leerFacetas, type Facet } from "./filtros";

export type ModeloSugerido = {
  /** Variant the row opens: the cheapest one that can be sold. */
  id: string;
  brand: string | null;
  modelo: string;
  category: string | null;
  calidades: number;
  desde_cents: number | null;
  imagen: string | null;
};

export type Sugerencias = {
  q: string;
  total: number;
  modelos: ModeloSugerido[];
  categorias: Facet[];
  marcas: Facet[];
};

/**
 * What the search box offers while typing: the first models, where the query
 * lands by part type and brand, and how many models it finds in all. Public —
 * the storefront has no session — so the query is trimmed and capped, and the
 * box debounces before calling.
 */
export async function sugerirBusqueda(q: string): Promise<ActionResult<Sugerencias>> {
  return attempt("sugerirBusqueda", async () => {
    const texto = q.trim().slice(0, 80);
    if (texto.length < 2) return { q: texto, total: 0, modelos: [], categorias: [], marcas: [] };

    const { modelos, facetas } = await buscarModelos(texto, {});
    const f = leerFacetas(facetas);
    const top = (xs: Facet[], n: number) => xs.filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, n);

    return {
      q: texto,
      total: modelos.length,
      modelos: modelos.slice(0, 5).map((m) => ({
        id: (m.variantes.find((v) => v.disponible) ?? m.variantes[0]).id,
        brand: m.brand,
        modelo: m.modelo,
        category: m.category,
        calidades: m.variantes.length,
        desde_cents: m.desde_cents,
        imagen: m.imagen,
      })),
      categorias: top(f.cat, 3),
      marcas: top(f.marca, 4),
    };
  });
}
