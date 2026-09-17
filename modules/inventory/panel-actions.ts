"use server";

import { auth } from "@clerk/nextjs/server";
import { updateTag } from "next/cache";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { assertPermiso, permisosDe } from "@/lib/auth/profile";
import { attempt, type ActionResult } from "@/lib/errors";
import { getCardex, type CardexResumen, type MovimientoCardex } from "@/modules/cardex/actions";

// The product side panel of /inventario (redesign part 2): everything it reads
// and the small edits it makes in place.

export type UbicacionProducto = {
  product_id: string;
  inventario: string;
  sucursal: string | null;
  quantity: number;
  actual: boolean;
};

export type DetalleProducto = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  size: string | null;
  color: string | null;
  category: string | null;
  price_cents: number;
  /** 0 for whoever may not see costs. */
  cost_cents: number;
  quantity: number;
  is_active: boolean;
  etiqueta: string | null;
  image_url: string | null;
  stock_minimo: number | null;
  proveedor: string | null;
  inventory_id: string;
  inventario: string | null;
  sucursal: string | null;
  es_dropship: boolean;
  /** Extra photos after the main one. */
  galeria: string[];
  ventas_30d: number;
  /** The same SKU in every inventory that carries it (this one included). */
  ubicaciones: UbicacionProducto[];
};

type InvEmbed = { name: string; es_dropship: boolean | null; sucursales: { nombre: string } | null } | null;

async function verCostos(): Promise<boolean> {
  const perms = await permisosDe();
  return perms.has("admin_total") || perms.has("costos_ver");
}

export async function detalleProducto(id: string): Promise<DetalleProducto | null> {
  await assertPermiso("inventario_ver");
  const { data } = await insforgeAdmin.database
    .from("products")
    .select(
      "id, sku, name, brand, size, color, category, price_cents, cost_cents, quantity, is_active, etiqueta, image_url, stock_minimo, inventory_id, proveedores(nombre), inventories(name, es_dropship, sucursales(nombre))",
    )
    .eq("id", id)
    .maybeSingle();
  const p = data as unknown as
    | (Omit<DetalleProducto, "proveedor" | "inventario" | "sucursal" | "es_dropship" | "galeria" | "ventas_30d" | "ubicaciones"> & {
        proveedores: { nombre: string } | null;
        inventories: InvEmbed;
      })
    | null;
  if (!p) return null;

  const insforge = await createInsForgeServerClient();
  const [gal, hermanos, lista, costos] = await Promise.all([
    insforgeAdmin.database
      .from("product_images")
      .select("url, orden")
      .eq("product_id", id)
      .order("orden", { ascending: true }),
    insforgeAdmin.database
      .from("products")
      .select("id, quantity, inventories(name, es_dropship, sucursales(nombre))")
      .eq("sku", p.sku)
      .eq("is_active", true),
    // Same numbers the list shows (last-30-day sales), same function.
    insforge.database.rpc("inventario_lista", { p_f: {}, p_ids: [id], p_limit: 1, p_offset: 0 }),
    verCostos(),
  ]);

  const fila = ((lista.data ?? []) as { ventas_30d: number | string }[])[0];
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    brand: p.brand,
    size: p.size,
    color: p.color,
    category: p.category,
    price_cents: p.price_cents,
    cost_cents: costos ? p.cost_cents : 0,
    quantity: p.quantity,
    is_active: p.is_active,
    etiqueta: p.etiqueta,
    image_url: p.image_url,
    stock_minimo: p.stock_minimo,
    proveedor: p.proveedores?.nombre ?? null,
    inventory_id: p.inventory_id,
    inventario: p.inventories?.name ?? null,
    sucursal: p.inventories?.sucursales?.nombre ?? null,
    es_dropship: p.inventories?.es_dropship ?? false,
    galeria: ((gal.data ?? []) as { url: string }[]).map((g) => g.url),
    ventas_30d: Number(fila?.ventas_30d ?? 0),
    ubicaciones: ((hermanos.data ?? []) as unknown as { id: string; quantity: number; inventories: InvEmbed }[])
      .map((h) => ({
        product_id: h.id,
        inventario: h.inventories?.name ?? "—",
        sucursal: h.inventories?.es_dropship ? "dropship" : (h.inventories?.sucursales?.nombre ?? null),
        quantity: Number(h.quantity ?? 0),
        actual: h.id === id,
      }))
      .sort((a, b) => Number(b.actual) - Number(a.actual) || b.quantity - a.quantity),
  };
}

/** The panel's Historial tab: the cárdex, recent part, costs only for eyes allowed. */
export async function historialProducto(
  id: string,
): Promise<{ movimientos: MovimientoCardex[]; resumen: CardexResumen }> {
  const [{ movimientos, resumen }, costos] = await Promise.all([getCardex(id, 60), verCostos()]);
  if (costos) return { movimientos, resumen };
  return {
    movimientos: movimientos.map((m) => ({ ...m, costo_unitario_cents: null })),
    resumen: { ...resumen, costoPromedioCents: null },
  };
}

export type NotaProducto = {
  id: string;
  texto: string;
  autor: string;
  mia: boolean;
  created_at: string;
};

export async function notasProducto(productId: string): Promise<NotaProducto[]> {
  await assertPermiso("inventario_ver");
  const { userId } = await auth();
  const { data } = await insforgeAdmin.database
    .from("product_notas")
    .select("id, texto, created_by, created_at")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(100);
  const notas = (data ?? []) as { id: string; texto: string; created_by: string | null; created_at: string }[];
  const ids = [...new Set(notas.map((n) => n.created_by).filter(Boolean))] as string[];
  const { data: profs } = ids.length
    ? await insforgeAdmin.database.from("profiles").select("id, full_name").in("id", ids)
    : { data: [] };
  const nombre = new Map(((profs ?? []) as { id: string; full_name: string | null }[]).map((u) => [u.id, u.full_name ?? "—"]));
  return notas.map((n) => ({
    id: n.id,
    texto: n.texto,
    autor: n.created_by ? (nombre.get(n.created_by) ?? "—") : "—",
    mia: !!userId && n.created_by === userId,
    created_at: n.created_at,
  }));
}

/** Anyone who may see the inventory may leave a note: it is team knowledge. */
export async function agregarNota(productId: string, texto: string): Promise<ActionResult<null>> {
  return attempt("agregarNota", async () => {
    await assertPermiso("inventario_ver");
    const { userId } = await auth();
    const limpio = texto.trim();
    if (!limpio) throw new Error("Escribe la nota");
    if (limpio.length > 2000) throw new Error("La nota es muy larga (máximo 2000 caracteres)");
    const { error } = await insforgeAdmin.database
      .from("product_notas")
      .insert([{ product_id: productId, texto: limpio, created_by: userId }]);
    if (error) throw new Error(error.message ?? "No se pudo guardar la nota");
    return null;
  });
}

/** Only its author, or an admin, deletes a note. */
export async function borrarNota(notaId: string): Promise<ActionResult<null>> {
  return attempt("borrarNota", async () => {
    await assertPermiso("inventario_ver");
    const { userId } = await auth();
    const perms = await permisosDe();
    const { data } = await insforgeAdmin.database
      .from("product_notas")
      .select("created_by")
      .eq("id", notaId)
      .maybeSingle();
    const n = data as { created_by: string | null } | null;
    if (!n) throw new Error("La nota ya no existe");
    if (n.created_by !== userId && !perms.has("admin_total")) throw new Error("Solo quien la escribió puede borrarla");
    const { error } = await insforgeAdmin.database.from("product_notas").delete().eq("id", notaId);
    if (error) throw new Error(error.message ?? "No se pudo borrar la nota");
    return null;
  });
}

/** Inactive products leave the list, the register and the shop. */
export async function setActivoProducto(id: string, activo: boolean): Promise<ActionResult<null>> {
  return attempt("setActivoProducto", async () => {
    await assertPermiso("inventario_gestionar");
    const insforge = await createInsForgeServerClient();
    const { error } = await insforge.database.from("products").update({ is_active: activo }).eq("id", id);
    if (error) throw new Error(error.message ?? "No se pudo cambiar el estado");
    updateTag("tienda");
    return null;
  });
}

/** Reorder point. Null goes back to the default ("5 or fewer"). */
export async function setStockMinimo(id: string, minimo: number | null): Promise<ActionResult<null>> {
  return attempt("setStockMinimo", async () => {
    await assertPermiso("inventario_gestionar");
    if (minimo !== null && (!Number.isInteger(minimo) || minimo < 0 || minimo > 100000))
      throw new Error("El mínimo debe ser un número entero de piezas");
    const insforge = await createInsForgeServerClient();
    const { error } = await insforge.database.from("products").update({ stock_minimo: minimo }).eq("id", id);
    if (error) throw new Error(error.message ?? "No se pudo guardar el mínimo");
    return null;
  });
}

/**
 * A copy to start a similar product from: same data and photo, no stock. The
 * SKU is unique per inventory, so the copy gets a suffix the user renames.
 */
export async function duplicarProducto(id: string): Promise<ActionResult<{ id: string }>> {
  return attempt("duplicarProducto", async () => {
    await assertPermiso("inventario_gestionar");
    const { data } = await insforgeAdmin.database
      .from("products")
      .select(
        "sku, name, brand, size, color, category, cost_cents, price_cents, inventory_id, etiqueta, proveedor_id, enlace_proveedor, image_url, stock_minimo",
      )
      .eq("id", id)
      .maybeSingle();
    const p = data as Record<string, unknown> & { sku: string; name: string } | null;
    if (!p) throw new Error("Producto no encontrado");

    const insforge = await createInsForgeServerClient();
    for (let n = 1; n <= 20; n++) {
      const sku = `${p.sku}-copia${n > 1 ? `-${n}` : ""}`;
      const { data: nuevo, error } = await insforge.database
        .from("products")
        .insert([{ ...p, sku, name: `${p.name} (copia)`, quantity: 0, is_active: true }])
        .select("id")
        .single();
      if (!error && nuevo) {
        updateTag("tienda");
        return { id: (nuevo as { id: string }).id };
      }
      // Another copy already took this SKU: try the next suffix.
      if (!/duplicate|unique/i.test(error?.message ?? "")) throw new Error(error?.message ?? "No se pudo duplicar");
    }
    throw new Error("No se pudo generar un SKU libre para la copia");
  });
}

export type MotivoAjuste = "conteo" | "danada" | "robo" | "devolucion" | "otro";

/**
 * "Contaste N": the database works out the delta, and refuses when the stock
 * moved since the user saw `esperado` (a sale while they were counting).
 */
export async function ajustarStock(
  productId: string,
  contado: number,
  esperado: number,
  motivo: MotivoAjuste,
  nota: string | null,
): Promise<ActionResult<{ movimientoId: string; cantidad: number }>> {
  return attempt("ajustarStock", async () => {
    await assertPermiso("inventario_gestionar");
    if (!Number.isInteger(contado) || contado < 0) throw new Error("La cantidad no puede ser negativa");
    const insforge = await createInsForgeServerClient();
    const { data, error } = await insforge.database.rpc("ajustar_stock", {
      p_product_id: productId,
      p_contado: contado,
      p_esperado: esperado,
      p_motivo: motivo,
      p_nota: nota?.trim() || null,
    });
    if (error) throw new Error(error.message ?? "No se pudo ajustar el stock");
    const fila = ((data ?? []) as { movimiento_id: string; cantidad: number }[])[0];
    if (!fila) throw new Error("No se pudo ajustar el stock");
    updateTag("tienda");
    return { movimientoId: fila.movimiento_id, cantidad: Number(fila.cantidad) };
  });
}

/** The toast's "Deshacer": writes the inverse movement (15-minute window). */
export async function deshacerAjuste(movimientoId: string): Promise<ActionResult<number>> {
  return attempt("deshacerAjuste", async () => {
    await assertPermiso("inventario_gestionar");
    const insforge = await createInsForgeServerClient();
    const { data, error } = await insforge.database.rpc("deshacer_ajuste", { p_movimiento_id: movimientoId });
    if (error) throw new Error(error.message ?? "No se pudo deshacer");
    updateTag("tienda");
    return Number(data);
  });
}
