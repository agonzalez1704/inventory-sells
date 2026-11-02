import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { normalize } from "@/lib/search";

export type Familia = { id: string; nombre: string; sistema: string | null };

/**
 * The refacción called `nombre` (accents and case ignored), created when the
 * shop doesn't have it yet — "Tope de amortiguador" typed in the inventory or
 * the catálogo becomes a refacción everyone can pick.
 */
export async function familiaDeNombre(nombre: string, sistema: string | null = null): Promise<Familia> {
  const limpio = nombre.replace(/\s+/g, " ").trim().slice(0, 80);
  const clave = normalize(limpio);
  if (!clave) throw new Error("Escribe el nombre de la refacción");
  const { data } = await insforgeAdmin.database.from("familias").select("id, nombre, sistema");
  const todas = (data ?? []) as Familia[];
  const ya = todas.find((f) => normalize(f.nombre) === clave);
  if (ya) return ya;

  const base = clave.replace(/ /g, "_").slice(0, 40);
  let id = base;
  for (let n = 2; todas.some((f) => f.id === id); n++) id = `${base}_${n}`;
  // The pattern only files future parts whose name starts with it; parts set
  // by hand keep their refacción (familia_fija).
  const nueva = { id, nombre: limpio, sistema, patron: `^${clave.toUpperCase()}`, orden: 100 };
  const { error } = await insforgeAdmin.database.from("familias").insert([nueva]);
  if (error) throw new Error(error.message ?? "No se pudo crear la refacción");
  return { id, nombre: limpio, sistema };
}
