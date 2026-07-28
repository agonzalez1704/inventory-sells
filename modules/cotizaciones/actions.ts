"use server";

import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { getPermisos } from "@/lib/auth/profile";
import { attempt, type ActionResult } from "@/lib/errors";
import type { Permiso } from "@/lib/permissions";

export type ItemInput = { product_id: string; qty: number };

async function requireUser(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  return userId;
}

async function requirePermiso(p: Permiso): Promise<string> {
  const userId = await requireUser();
  if (!(await getPermisos(userId)).has(p)) throw new Error("Sin permiso");
  return userId;
}

type CotOwner = { created_by: string; vendedor_id: string | null; estado: string };

// A user may act on a quote if they can see all, or it's theirs (created or
// assigned) — the same rule that scopes the list.
async function loadYAutoriza(id: string, userId: string): Promise<CotOwner> {
  const { data } = await insforgeAdmin.database
    .from("cotizaciones")
    .select("created_by, vendedor_id, estado")
    .eq("id", id)
    .maybeSingle();
  const c = data as CotOwner | null;
  if (!c) throw new Error("Cotización no encontrada");
  const perms = await getPermisos(userId);
  const propia = c.created_by === userId || c.vendedor_id === userId;
  if (!perms.has("cotizaciones_ver_todas") && !propia) throw new Error("Sin acceso a esta cotización");
  return c;
}

export async function crearCotizacion(
  items: ItemInput[],
  customerId: string | null,
  vendedorId: string | null,
  notas: string,
  canal: "mostrador" | "whatsapp" | "web",
  estado: "borrador" | "pendiente",
): Promise<ActionResult<{ id: string; folio: string }>> {
  return attempt("crearCotizacion", async () => {
    await requirePermiso("cotizar");
    if (items.length === 0) throw new Error("Agrega al menos un producto");
    // Authenticated client → requesting_user_id() resolves for created_by.
    const insforge = await createInsForgeServerClient();
    const { data, error } = await insforge.database.rpc("crear_cotizacion", {
      p_items: items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
      p_customer_id: customerId,
      p_canal: canal,
      p_vendedor_id: vendedorId,
      p_vigencia_dias: 7,
      p_notas: notas || null,
      p_estado: estado,
    });
    if (error) throw new Error(error.message ?? "No se pudo crear la cotización");
    const row = (Array.isArray(data) ? data[0] : data) as { id: string; folio: string } | undefined;
    if (!row?.id) throw new Error("No se pudo crear la cotización");
    return row;
  });
}

export async function editarCotizacion(
  id: string,
  items: ItemInput[],
  notas: string,
): Promise<ActionResult<null>> {
  return attempt("editarCotizacion", async () => {
    const userId = await requirePermiso("cotizar");
    const c = await loadYAutoriza(id, userId);
    if (c.estado !== "borrador" && c.estado !== "pendiente")
      throw new Error("Solo se puede editar mientras está en borrador o pendiente");
    if (items.length === 0) throw new Error("Agrega al menos un producto");

    // Re-snapshot from the current catalog and rebuild the lines.
    const ids = items.map((i) => i.product_id);
    const { data: prods } = await insforgeAdmin.database
      .from("products")
      .select("id, name, sku, price_cents, cost_cents")
      .in("id", ids);
    const byId = new Map(
      ((prods ?? []) as { id: string; name: string; sku: string; price_cents: number; cost_cents: number }[]).map(
        (p) => [p.id, p],
      ),
    );
    let subtotal = 0;
    const rows = items.map((it) => {
      const p = byId.get(it.product_id);
      if (!p) throw new Error("Producto no disponible");
      const line = p.price_cents * it.qty;
      subtotal += line;
      return {
        cotizacion_id: id,
        product_id: p.id,
        nombre: p.name,
        sku: p.sku,
        qty: it.qty,
        unit_price_cents: p.price_cents,
        cost_cents: p.cost_cents,
        line_total_cents: line,
      };
    });

    await insforgeAdmin.database.from("cotizacion_items").delete().eq("cotizacion_id", id);
    await insforgeAdmin.database.from("cotizacion_items").insert(rows);
    const { error } = await insforgeAdmin.database
      .from("cotizaciones")
      .update({ subtotal_cents: subtotal, total_cents: subtotal, notas: notas || null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message ?? "No se pudo editar");
    return null;
  });
}

async function cambiarEstado(
  id: string,
  desde: string[],
  hacia: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const { data } = await insforgeAdmin.database
    .from("cotizaciones")
    .select("estado")
    .eq("id", id)
    .maybeSingle();
  const est = (data as { estado: string } | null)?.estado;
  if (!est) throw new Error("Cotización no encontrada");
  if (!desde.includes(est)) throw new Error(`No se puede pasar a ${hacia} desde ${est}`);
  const { error } = await insforgeAdmin.database
    .from("cotizaciones")
    .update({ estado: hacia, updated_at: new Date().toISOString(), ...extra })
    .eq("id", id);
  if (error) throw new Error(error.message ?? "No se pudo actualizar");
}

export async function enviarCotizacion(id: string): Promise<ActionResult<null>> {
  return attempt("enviarCotizacion", async () => {
    const userId = await requirePermiso("cotizar");
    await loadYAutoriza(id, userId);
    await cambiarEstado(id, ["borrador"], "pendiente");
    return null;
  });
}

export async function autorizarCotizacion(id: string): Promise<ActionResult<null>> {
  return attempt("autorizarCotizacion", async () => {
    const userId = await requirePermiso("autorizar");
    await loadYAutoriza(id, userId);
    await cambiarEstado(id, ["pendiente"], "autorizada", { autorizada_at: new Date().toISOString() });
    return null;
  });
}

export async function cancelarCotizacion(id: string, motivo: string): Promise<ActionResult<null>> {
  return attempt("cancelarCotizacion", async () => {
    const userId = await requirePermiso("cotizar");
    await loadYAutoriza(id, userId);
    await cambiarEstado(id, ["borrador", "pendiente", "autorizada"], "cancelada", {
      cancel_motivo: motivo.trim() || null,
    });
    return null;
  });
}

export async function asignarCotizacion(id: string, vendedorId: string): Promise<ActionResult<null>> {
  return attempt("asignarCotizacion", async () => {
    await requirePermiso("cotizaciones_reasignar");
    const { error } = await insforgeAdmin.database
      .from("cotizaciones")
      .update({ vendedor_id: vendedorId || null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message ?? "No se pudo asignar");
    return null;
  });
}

export async function convertirCotizacion(
  id: string,
  metodo: string,
): Promise<ActionResult<{ saleId: string }>> {
  return attempt("convertirCotizacion", async () => {
    const userId = await requirePermiso("autorizar");
    await loadYAutoriza(id, userId);
    const { data, error } = await insforgeAdmin.database.rpc("convertir_cotizacion", {
      p_id: id,
      p_metodo: metodo,
    });
    if (error) throw new Error(error.message ?? "No se pudo convertir");
    return { saleId: String(data) };
  });
}
