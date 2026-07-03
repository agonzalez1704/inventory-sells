// Fixed set of product tags (enum). Single source of truth — the DB CHECK in
// the products_etiqueta_check constraint mirrors this list. To add a tag: add
// it here AND in a migration that swaps the CHECK constraint.
export const ETIQUETAS = ["Almacén disputa"] as const;

export type Etiqueta = (typeof ETIQUETAS)[number];

export function esEtiquetaValida(v: string | null | undefined): v is Etiqueta {
  return !!v && (ETIQUETAS as readonly string[]).includes(v);
}
