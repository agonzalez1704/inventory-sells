"use server";

import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { assertPermiso } from "@/lib/auth/profile";
import { attempt, type ActionResult } from "@/lib/errors";
import type { MotivoAjuste } from "@/modules/inventory/panel-actions";

// Physical counts. The document opens on one inventory with a snapshot of
// what the system says, people type what they found — each entry lands in the
// database the moment it is typed, so a dead battery or a reload loses
// nothing — and it closes into a report valued at cost and at sale price.

export type EstadoConteo = "abierto" | "cerrado" | "aplicado";

export type ConteoResumen = {
  id: string;
  nombre: string;
  motivo: string | null;
  estado: EstadoConteo;
  created_at: string;
  cerrado_at: string | null;
  inventario: string;
  total: number;
  contados: number;
  /** Who opened it, resolved to a name when the profile is known. */
  autor: string | null;
};

export async function listarConteos(): Promise<ConteoResumen[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const [{ data }, { data: profs }] = await Promise.all([
    insforgeAdmin.database
      .from("conteos")
      .select(
        "id, nombre, motivo, estado, created_at, cerrado_at, created_by, inventories(name), conteo_items(contado)",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    insforgeAdmin.database.from("profiles").select("id, full_name"),
  ]);
  const nombre = new Map(
    ((profs ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]),
  );
  return ((data ?? []) as unknown as {
    id: string; nombre: string; motivo: string | null; estado: EstadoConteo;
    created_at: string; cerrado_at: string | null; created_by: string;
    inventories: { name: string } | null; conteo_items: { contado: number | null }[];
  }[]).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    motivo: c.motivo,
    estado: c.estado,
    created_at: c.created_at,
    cerrado_at: c.cerrado_at,
    inventario: c.inventories?.name ?? "",
    total: c.conteo_items.length,
    contados: c.conteo_items.filter((i) => i.contado !== null).length,
    autor: nombre.get(c.created_by) ?? null,
  }));
}

export type ConteoItem = {
  product_id: string;
  nombre: string;
  sku: string;
  /** What the system said when this row was counted (or when the count opened). */
  esperado: number;
  contado: number | null;
  cost_cents: number;
  price_cents: number;
  contado_at: string | null;
};

export type ConteoDetalle = {
  id: string;
  nombre: string;
  motivo: string | null;
  estado: EstadoConteo;
  created_at: string;
  cerrado_at: string | null;
  aplicado_at: string | null;
  inventario: string;
  items: ConteoItem[];
};

export async function getConteo(id: string): Promise<ConteoDetalle | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const { data: c } = await insforgeAdmin.database
    .from("conteos")
    .select("id, nombre, motivo, estado, created_at, cerrado_at, aplicado_at, inventories(name)")
    .eq("id", id)
    .maybeSingle();
  if (!c) return null;

  // Paged: a whole inventory is more rows than one call hands back.
  const items: ConteoItem[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data } = await insforgeAdmin.database
      .from("conteo_items")
      .select("product_id, esperado, contado, cost_cents, price_cents, contado_at, products(name, sku)")
      .eq("conteo_id", id)
      .order("product_id")
      .range(desde, desde + 999);
    const page = (data ?? []) as unknown as {
      product_id: string; esperado: number; contado: number | null; cost_cents: number;
      price_cents: number; contado_at: string | null; products: { name: string; sku: string } | null;
    }[];
    for (const r of page) {
      items.push({
        product_id: r.product_id,
        nombre: r.products?.name ?? "Producto",
        sku: r.products?.sku ?? "",
        esperado: Number(r.esperado),
        contado: r.contado === null ? null : Number(r.contado),
        cost_cents: Number(r.cost_cents),
        price_cents: Number(r.price_cents),
        contado_at: r.contado_at,
      });
    }
    if (page.length < 1000) break;
  }
  items.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const h = c as unknown as {
    id: string; nombre: string; motivo: string | null; estado: EstadoConteo; created_at: string;
    cerrado_at: string | null; aplicado_at: string | null; inventories: { name: string } | null;
  };
  return {
    id: h.id,
    nombre: h.nombre,
    motivo: h.motivo,
    estado: h.estado,
    created_at: h.created_at,
    cerrado_at: h.cerrado_at,
    aplicado_at: h.aplicado_at,
    inventario: h.inventories?.name ?? "",
    items,
  };
}

export async function iniciarConteo(
  inventoryId: string,
  nombre: string,
  motivo: string | null,
): Promise<ActionResult<string>> {
  return attempt("iniciarConteo", async () => {
    await assertPermiso("inventario_gestionar");
    const insforge = await createInsForgeServerClient();
    const { data, error } = await insforge.database.rpc("iniciar_conteo", {
      p_inventory: inventoryId,
      p_nombre: nombre,
      p_motivo: motivo,
    });
    if (error) throw new Error(error.message ?? "No se pudo abrir el conteo");
    return String(data);
  });
}

/** One row's physical count, saved on the spot. Null clears a mistaken entry. */
export async function contarItem(
  conteoId: string,
  productId: string,
  contado: number | null,
): Promise<ActionResult<{ esperado: number }>> {
  return attempt("contarItem", async () => {
    await assertPermiso("inventario_ver");
    if (contado !== null && (!Number.isInteger(contado) || contado < 0)) {
      throw new Error("La cantidad no puede ser negativa");
    }
    const insforge = await createInsForgeServerClient();
    const { data, error } = await insforge.database.rpc("contar_item", {
      p_conteo: conteoId,
      p_product_id: productId,
      p_contado: contado,
    });
    if (error) throw new Error(error.message ?? "No se guardó");
    const fila = ((data ?? []) as { esperado: number }[])[0];
    return { esperado: Number(fila?.esperado ?? 0) };
  });
}

export async function cerrarConteo(conteoId: string): Promise<ActionResult<null>> {
  return attempt("cerrarConteo", async () => {
    await assertPermiso("inventario_gestionar");
    const insforge = await createInsForgeServerClient();
    const { error } = await insforge.database.rpc("cerrar_conteo", { p_conteo: conteoId });
    if (error) throw new Error(error.message ?? "No se pudo cerrar");
    return null;
  });
}

/** Turn every counted difference into an adjustment movement. */
export async function aplicarConteo(
  conteoId: string,
  motivo: MotivoAjuste,
): Promise<ActionResult<{ ajustados: number; piezas: number }>> {
  return attempt("aplicarConteo", async () => {
    await assertPermiso("inventario_gestionar");
    const insforge = await createInsForgeServerClient();
    const { data, error } = await insforge.database.rpc("aplicar_conteo", {
      p_conteo: conteoId,
      p_motivo: motivo,
    });
    if (error) throw new Error(error.message ?? "No se pudo aplicar");
    const fila = ((data ?? []) as { ajustados: number; piezas: number }[])[0];
    return { ajustados: Number(fila?.ajustados ?? 0), piezas: Number(fila?.piezas ?? 0) };
  });
}
