"use server";

import { revalidatePath } from "next/cache";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { attempt, type ActionResult } from "@/lib/errors";
import { permisosDe } from "@/lib/auth/profile";
import type { Permiso } from "@/lib/permissions";

/**
 * Search by car: make → model → year → family.
 *
 * Ruli's counter asks "¿qué carro trae?" before anything else, and the catalog
 * already carries the vehicle on its tags. Reading it is the same privilege as
 * reading the catalog — the register, the quote builder and the inventory
 * table all legitimately look parts up.
 */

const VER_CATALOGO: Permiso[] = ["pos_vender", "cotizar", "inventario_ver", "inventario_gestionar"];

async function assertVerCatalogo(): Promise<void> {
  const perms = await permisosDe();
  if (!perms.has("admin_total") && !VER_CATALOGO.some((p) => perms.has(p))) throw new Error("Sin permiso");
}

/**
 * The car at the counter: model plus either a named version or a year.
 *
 * A named version ("V-Drive", "2ª generación") already pins the generation, so
 * the year is not asked for; a model nobody has named is still picked by year.
 */
export type Vehiculo = { marca: string; modelo: string; anio: number | null; version?: string | null };

export type PiezaVehiculo = {
  id: string;
  inventory_id: string;
  sku: string;
  name: string;
  image_url: string | null;
  price_cents: number;
  cost_cents: number;
  quantity: number;
  familia: string | null;
  familia_nombre: string | null;
  sistema: string | null;
  sistema_nombre: string | null;
  /** "Versa 2012–2017" — what the counter reads back to the customer. */
  compat: string | null;
  anio_desde: number | null;
  anio_hasta: number | null;
  version: string | null;
};

export type ModeloVehiculo = {
  marca: string;
  modelo: string;
  piezas: number;
  anio_min: number | null;
  anio_max: number | null;
};

/**
 * Models by name, the make along for the ride.
 *
 * The counter says "un Versa", not "un Nissan Versa" — and model names are
 * nearly unique anyway (1,549 names across 1,579 make+model pairs), so asking
 * for the make first only cost a tap.
 */
export async function buscarModelos(q: string): Promise<ModeloVehiculo[]> {
  await assertVerCatalogo();
  const { data } = await insforgeAdmin.database.rpc("vehiculo_buscar_modelos", {
    p_q: q.trim() || null,
    p_limit: 40,
  });
  return (data ?? []) as ModeloVehiculo[];
}

export async function marcasDeVehiculo(): Promise<{ marca: string; piezas: number }[]> {
  await assertVerCatalogo();
  const { data } = await insforgeAdmin.database.rpc("vehiculo_marcas", {});
  return (data ?? []) as { marca: string; piezas: number }[];
}

export async function modelosDeMarca(marca: string): Promise<{ modelo: string; piezas: number }[]> {
  await assertVerCatalogo();
  const { data } = await insforgeAdmin.database.rpc("vehiculo_modelos", { p_marca: marca });
  return (data ?? []) as { modelo: string; piezas: number }[];
}

export async function aniosDeModelo(marca: string, modelo: string): Promise<{ anio: number; piezas: number }[]> {
  await assertVerCatalogo();
  const { data } = await insforgeAdmin.database.rpc("vehiculo_anios", { p_marca: marca, p_modelo: modelo });
  return (data ?? []) as { anio: number; piezas: number }[];
}

export async function piezasDeVehiculo(input: {
  marca: string;
  modelo?: string | null;
  anio?: number | null;
  familia?: string | null;
  sistema?: string | null;
  version?: string | null;
  soloStock?: boolean;
}): Promise<PiezaVehiculo[]> {
  await assertVerCatalogo();
  const perms = await permisosDe();
  const veCostos = perms.has("admin_total") || perms.has("costos_ver");
  const { data, error } = await insforgeAdmin.database.rpc("piezas_por_vehiculo", {
    p_marca: input.marca,
    p_modelo: input.modelo ?? null,
    p_anio: input.anio ?? null,
    p_familia: input.familia ?? null,
    p_sistema: input.sistema ?? null,
    p_version: input.version ?? null,
    p_solo_stock: input.soloStock ?? false,
    p_limit: 300,
  });
  if (error) throw new Error(error.message ?? "No se pudo buscar");
  // The cost never reaches a browser that may not see it — same rule as the
  // catalog search.
  return ((data ?? []) as PiezaVehiculo[]).map((p) => ({ ...p, cost_cents: veCostos ? p.cost_cents : 0 }));
}

/** Whether this shop sells parts by vehicle at all — Ruli does, Fiable doesn't. */
export async function hayVehiculos(): Promise<boolean> {
  const { data } = await insforgeAdmin.database
    .from("tags")
    .select("id")
    .not("veh_marca", "is", null)
    .limit(1);
  return (data ?? []).length > 0;
}

export type VersionVehiculo = {
  version: string | null;
  piezas: number;
  anio_min: number | null;
  anio_max: number | null;
  etiquetas: number;
};

export type RangoVehiculo = {
  anio_desde: number | null;
  anio_hasta: number | null;
  version: string | null;
  piezas: number;
  etiquetas: number;
};

/** The named versions of a model — empty of names until someone names them. */
export async function versionesDeModelo(marca: string, modelo: string): Promise<VersionVehiculo[]> {
  await assertVerCatalogo();
  const { data } = await insforgeAdmin.database.rpc("vehiculo_versiones", {
    p_marca: marca,
    p_modelo: modelo,
  });
  return (data ?? []) as VersionVehiculo[];
}

/** Every year band of a model, for the screen that names them. */
export async function rangosDeModelo(marca: string, modelo: string): Promise<RangoVehiculo[]> {
  await assertVerCatalogo();
  const { data } = await insforgeAdmin.database.rpc("vehiculo_rangos", {
    p_marca: marca,
    p_modelo: modelo,
  });
  return (data ?? []) as RangoVehiculo[];
}

/** Name one band: "2012–2019 → 2ª generación". Admin only, enforced in the RPC. */
export async function nombrarVersion(input: {
  marca: string;
  modelo: string;
  anioDesde: number | null;
  anioHasta: number | null;
  version: string;
}): Promise<ActionResult<{ etiquetas: number }>> {
  return attempt("nombrarVersion", async () => {
    const insforge = await createInsForgeServerClient();
    const { data, error } = await insforge.database.rpc("nombrar_version", {
      p_marca: input.marca,
      p_modelo: input.modelo,
      p_anio_desde: input.anioDesde,
      p_anio_hasta: input.anioHasta,
      p_version: input.version,
    });
    if (error) throw new Error(error.message ?? "No se pudo guardar la versión");
    revalidatePath("/configuracion");
    return { etiquetas: Number(data ?? 0) };
  });
}
