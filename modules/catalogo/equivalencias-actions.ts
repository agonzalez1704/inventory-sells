"use server";

import { updateTag } from "next/cache";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { assertPermiso } from "@/lib/auth/profile";
import { attempt, type ActionResult } from "@/lib/errors";
import type { Actual, FilaEquivalencia } from "./equivalencias-excel";

// Loading the owner's equivalencias Excel. The browser reads the file and
// builds the table (equivalencias-excel.ts); these steps upload it in pieces,
// swap it in at once, and re-link every product a page at a time.

const DB = insforgeAdmin.database;
const PAGINA = 1000;

/** What the system has now: to keep group ids and carry manual links over. */
export async function equivalenciasActuales(): Promise<ActionResult<Actual[]>> {
  return attempt("equivalenciasActuales", async () => {
    await assertPermiso("inventario_gestionar");
    const todas: Actual[] = [];
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await DB.from("equivalencias")
        .select("marca, clave, grupo, origen")
        .order("id")
        .range(desde, desde + PAGINA - 1);
      if (error) throw new Error(error.message ?? "No se pudo leer la tabla de equivalencias");
      const filas = (data ?? []) as Actual[];
      todas.push(...filas);
      if (filas.length < PAGINA) return todas;
    }
  });
}

/** One piece of the upload. Nothing is visible until publicarEquivalencias. */
export async function subirEquivalencias(lote: string, filas: FilaEquivalencia[]): Promise<ActionResult<null>> {
  return attempt("subirEquivalencias", async () => {
    await assertPermiso("inventario_gestionar");
    if (filas.length > 5000) throw new Error("Lote demasiado grande");
    const { error } = await DB.from("equivalencias_carga").insert(
      filas.map((f) => ({ lote, grupo: f.grupo, marca: f.marca, clave: f.clave.slice(0, 80), origen: f.origen })),
    );
    if (error) throw new Error(error.message ?? "No se pudo subir");
    return null;
  });
}

/** Replace the whole table with the upload. Returns how many numbers it holds. */
export async function publicarEquivalencias(lote: string): Promise<ActionResult<number>> {
  return attempt("publicarEquivalencias", async () => {
    await assertPermiso("inventario_gestionar");
    const { data, error } = await DB.rpc("equivalencias_publicar", { p_lote: lote });
    if (error) throw new Error(error.message ?? "No se pudo publicar");
    return Number(data ?? 0);
  });
}

export type PasoAplicar = { ultimo: string | null; vistos: number; cambiados: number; ligados: number };

/** Re-link one page of products to the table. Call again with `ultimo` until vistos is 0. */
export async function aplicarEquivalencias(despues: string | null): Promise<ActionResult<PasoAplicar>> {
  return attempt("aplicarEquivalencias", async () => {
    await assertPermiso("inventario_gestionar");
    const { data, error } = await DB.rpc("equivalencias_aplicar", { p_despues: despues, p_limite: 4000 });
    if (error) throw new Error(error.message ?? "No se pudo ligar los productos");
    const paso = data as PasoAplicar;
    if (!paso.vistos) updateTag("tienda");
    return paso;
  });
}
