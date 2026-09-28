"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { getPermisos } from "@/lib/auth/profile";
import { attempt, type ActionResult } from "@/lib/errors";
import { mxHoy, rangoUTC } from "@/lib/caja-range";

/**
 * "Lo que piden y no tenemos": demand the counter could not serve.
 *
 * Anyone who sells may write one down — it happens with the customer standing
 * there — and the list of them belongs to whoever buys, so reading the grouped
 * list needs `surtir`.
 */

export type TipoPieza = "pantalla" | "bateria" | "tapa" | "flex" | "otro";

export type DemandaReciente = {
  id: string;
  texto: string;
  qty: number;
  created_at: string;
  quien: string | null;
  sucursal: string | null;
  cliente: string | null;
};

export type DemandaAgrupada = {
  norm: string;
  texto: string;
  tipo: TipoPieza;
  veces: number;
  piezas: number;
  ultima: string;
  product_id: string | null;
  producto: string | null;
  existencia: number | null;
  clientes: string | null;
  esperando: number;
  ids: string[];
};

async function quienSoy(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  return userId;
}

async function puedeVender(userId: string): Promise<void> {
  const perms = await getPermisos(userId);
  if (!perms.has("admin_total") && !perms.has("pos_vender") && !perms.has("cotizar"))
    throw new Error("Sin permiso");
}

async function puedeSurtir(userId: string): Promise<void> {
  const perms = await getPermisos(userId);
  if (!perms.has("admin_total") && !perms.has("surtir")) throw new Error("Sin permiso");
}

/** Where this seller checked in today — the branch the demand belongs to. */
async function sucursalDeHoy(userId: string): Promise<string | null> {
  const { startISO, endISO } = rangoUTC(mxHoy(), mxHoy());
  const { data } = await insforgeAdmin.database
    .from("checkins")
    .select("sucursal_id")
    .eq("profile_id", userId)
    .gte("created_at", startISO)
    .lt("created_at", endISO)
    .limit(1);
  return ((data ?? []) as { sucursal_id: string }[])[0]?.sucursal_id ?? null;
}

export async function anotarDemanda(input: {
  texto: string;
  tipo: TipoPieza;
  qty: number;
  /** Set when the piece exists in the catalog and was simply at zero. */
  productId?: string | null;
  customerId?: string | null;
  contacto?: string | null;
  nota?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  return attempt("anotarDemanda", async () => {
    const userId = await quienSoy();
    await puedeVender(userId);
    const texto = input.texto.trim();
    if (texto.length < 2) throw new Error("Escribe qué pidieron");

    const { data: normData, error: normErr } = await insforgeAdmin.database.rpc("normalizar_demanda", {
      p_texto: texto,
    });
    if (normErr) throw new Error(normErr.message ?? "No se pudo guardar");

    const { data, error } = await insforgeAdmin.database
      .from("demanda_no_surtida")
      .insert([
        {
          texto,
          norm: String(normData ?? texto.toLowerCase()),
          tipo: input.tipo,
          qty: Math.min(999, Math.max(1, Math.round(input.qty || 1))),
          product_id: input.productId ?? null,
          customer_id: input.customerId ?? null,
          contacto: input.contacto?.trim() || null,
          nota: input.nota?.trim() || null,
          sucursal_id: await sucursalDeHoy(userId),
          created_by: userId,
        },
      ])
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message ?? "No se pudo guardar");
    revalidatePath("/surtir");
    return { id: String((data as { id?: string } | null)?.id ?? "") };
  });
}

/** The last times this same model was asked for — shown next to the empty search. */
export async function demandaReciente(texto: string): Promise<DemandaReciente[]> {
  const userId = await quienSoy();
  await puedeVender(userId);
  const t = texto.trim();
  if (t.length < 2) return [];

  const { data: normData } = await insforgeAdmin.database.rpc("normalizar_demanda", { p_texto: t });
  const norm = String(normData ?? t.toLowerCase());

  const { data } = await insforgeAdmin.database
    .from("demanda_no_surtida")
    .select("id, texto, qty, created_at, created_by, customers(nombre, is_system), sucursales(nombre)")
    .eq("norm", norm)
    .in("estado", ["abierto", "pedido"])
    .order("created_at", { ascending: false })
    .limit(5);

  const filas = (data ?? []) as unknown as {
    id: string;
    texto: string;
    qty: number;
    created_at: string;
    created_by: string | null;
    customers: { nombre: string; is_system: boolean } | null;
    sucursales: { nombre: string } | null;
  }[];
  if (filas.length === 0) return [];

  const ids = [...new Set(filas.map((f) => f.created_by).filter(Boolean))] as string[];
  const { data: perfiles } = await insforgeAdmin.database
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);
  const nombre = new Map(
    ((perfiles ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]),
  );

  return filas.map((f) => ({
    id: f.id,
    texto: f.texto,
    qty: f.qty,
    created_at: f.created_at,
    quien: (f.created_by ? nombre.get(f.created_by) : null) ?? null,
    sucursal: f.sucursales?.nombre ?? null,
    cliente: f.customers && !f.customers.is_system ? f.customers.nombre : null,
  }));
}

/** The buyer's list: one row per model, most asked first. */
export async function listaDemanda(dias = 30): Promise<DemandaAgrupada[]> {
  const userId = await quienSoy();
  await puedeSurtir(userId);
  const { data, error } = await insforgeAdmin.database.rpc("demanda_agrupada", { p_dias: dias });
  if (error) throw new Error(error.message ?? "No se pudo leer");
  return (data ?? []) as DemandaAgrupada[];
}

/** Move every entry of one model out of the list, or back into it. */
export async function cerrarDemanda(
  ids: string[],
  estado: "pedido" | "surtido" | "descartado" | "abierto",
): Promise<ActionResult<null>> {
  return attempt("cerrarDemanda", async () => {
    const userId = await quienSoy();
    await puedeSurtir(userId);
    if (ids.length === 0) return null;
    const cerrado = estado === "surtido" || estado === "descartado";
    const { error } = await insforgeAdmin.database
      .from("demanda_no_surtida")
      .update({
        estado,
        cerrado_at: cerrado ? new Date().toISOString() : null,
        cerrado_por: cerrado ? userId : null,
      })
      .in("id", ids);
    if (error) throw new Error(error.message ?? "No se pudo actualizar");
    revalidatePath("/surtir");
    return null;
  });
}

/**
 * Pieces asked for and still not supplied, by product — what the restock adds
 * on top of the sales of the period. Models with no product in the catalog are
 * keyed by their normalized text instead.
 */
export async function demandaPendiente(dias = 30): Promise<Record<string, number>> {
  const userId = await quienSoy();
  await puedeSurtir(userId);
  const desde = new Date(Date.now() - Math.max(1, dias) * 86_400_000).toISOString();
  const { data } = await insforgeAdmin.database
    .from("demanda_no_surtida")
    .select("norm, qty, product_id")
    .eq("estado", "abierto")
    .gte("created_at", desde);
  const out: Record<string, number> = {};
  for (const d of (data ?? []) as { norm: string; qty: number; product_id: string | null }[]) {
    const k = d.product_id ?? `texto:${d.norm}`;
    out[k] = (out[k] ?? 0) + d.qty;
  }
  return out;
}
