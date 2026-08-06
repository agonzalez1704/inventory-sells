"use server";

import { insforgeAdmin } from "@/lib/insforge/admin";
import { assertPermiso } from "@/lib/auth/profile";
import { attempt, type ActionResult } from "@/lib/errors";

export type Proveedor = {
  id: string;
  nombre: string;
  telefono: string | null;
  contacto: string | null;
  lead_time_dias: number;
  notas: string | null;
  is_active: boolean;
  created_at: string;
};

export type ProveedorInput = {
  nombre: string;
  telefono: string | null;
  contacto: string | null;
  lead_time_dias: number;
  notas: string | null;
};

const COLS = "id, nombre, telefono, contacto, lead_time_dias, notas, is_active, created_at";

function clean(input: ProveedorInput) {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("Falta el nombre del proveedor");
  const dias = Math.round(Number(input.lead_time_dias));
  if (!Number.isFinite(dias) || dias < 0 || dias > 120)
    throw new Error("Tiempo de entrega inválido (0 a 120 días)");
  return {
    nombre,
    telefono: input.telefono?.trim() || null,
    contacto: input.contacto?.trim() || null,
    lead_time_dias: dias,
    notas: input.notas?.trim() || null,
  };
}

export async function listarProveedores(incluirInactivos = false): Promise<Proveedor[]> {
  await assertPermiso("inventario_ver");
  let q = insforgeAdmin.database.from("proveedores").select(COLS);
  if (!incluirInactivos) q = q.eq("is_active", true);
  const { data } = await q.order("nombre", { ascending: true });
  return (data ?? []) as Proveedor[];
}

export async function crearProveedor(
  input: ProveedorInput,
): Promise<ActionResult<{ id: string }>> {
  return attempt("crearProveedor", async () => {
  const userId = await assertPermiso("inventario_gestionar");
  // created_by is NOT NULL and defaults to requesting_user_id(), which reads the
  // JWT — and insforgeAdmin carries none, so the default resolved to NULL and
  // every insert died on the not-null constraint. The user id has to come from
  // the caller, the way every other admin-client insert in this app does it.
  const { data, error } = await insforgeAdmin.database
    .from("proveedores")
    .insert([{ ...clean(input), created_by: userId }])
    .select("id")
    .single();
  if (error || !data) {
    if (/duplicate|unique/i.test(error?.message ?? ""))
      throw new Error("Ya existe un proveedor con ese nombre");
    throw new Error(error?.message ?? "Error al crear el proveedor");
  }
  return { id: (data as { id: string }).id };
  });
}

export async function editarProveedor(
  id: string,
  input: ProveedorInput,
): Promise<ActionResult<null>> {
  return attempt("editarProveedor", async () => {
  await assertPermiso("inventario_gestionar");
  const { error } = await insforgeAdmin.database
    .from("proveedores")
    .update(clean(input))
    .eq("id", id);
  if (error) {
    if (/duplicate|unique/i.test(error.message ?? ""))
      throw new Error("Ya existe un proveedor con ese nombre");
    throw new Error(error.message ?? "Error al guardar el proveedor");
  }
  return null;
  });
}

// Soft archive — products keep pointing at it, so history stays readable.
export async function archivarProveedor(
  id: string,
  activo: boolean,
): Promise<ActionResult<null>> {
  return attempt("archivarProveedor", async () => {
  await assertPermiso("inventario_gestionar");
  const { error } = await insforgeAdmin.database
    .from("proveedores")
    .update({ is_active: activo })
    .eq("id", id);
  if (error) throw new Error(error.message ?? "Error al archivar");
  return null;
  });
}

// How many products each supplier covers — an archived supplier that still
// supplies products is worth seeing before you go looking for the stock.
export async function conteoPorProveedor(): Promise<Record<string, number>> {
  await assertPermiso("inventario_ver");
  const { data } = await insforgeAdmin.database
    .from("products")
    .select("proveedor_id")
    .eq("is_active", true);
  const out: Record<string, number> = {};
  for (const r of (data ?? []) as { proveedor_id: string | null }[]) {
    if (r.proveedor_id) out[r.proveedor_id] = (out[r.proveedor_id] ?? 0) + 1;
  }
  return out;
}
