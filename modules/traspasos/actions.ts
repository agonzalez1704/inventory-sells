"use server";

import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { assertPermiso } from "@/lib/auth/profile";
import { attempt, type ActionResult } from "@/lib/errors";

// Merchandise transfers between inventories. The document is immutable: it
// executes atomically in the ejecutar_traspaso RPC and stays as the record of
// qué, cuánto, quién, cuándo y de dónde a dónde.

export type TraspasoItemDoc = {
  qty: number;
  producto: { name: string; sku: string } | null;
};

export type Traspaso = {
  id: string;
  folio: string;
  notas: string | null;
  created_by: string;
  created_at: string;
  origen: { name: string } | null;
  destino: { name: string } | null;
  traspaso_items: TraspasoItemDoc[];
  /** Resolved display name of whoever moved the goods. */
  vendedor?: string | null;
};

export async function listarTraspasos(): Promise<Traspaso[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const [{ data }, { data: profs }] = await Promise.all([
    insforgeAdmin.database
      .from("traspasos")
      .select(
        "id, folio, notas, created_by, created_at, origen:inventories!traspasos_origen_id_fkey(name), destino:inventories!traspasos_destino_id_fkey(name), traspaso_items(qty, producto:products!traspaso_items_producto_origen_id_fkey(name, sku))",
      )
      .order("created_at", { ascending: false })
      .limit(100),
    insforgeAdmin.database.from("profiles").select("id, full_name"),
  ]);
  const nombre = new Map(
    ((profs ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]),
  );
  return ((data ?? []) as unknown as Traspaso[]).map((t) => ({
    ...t,
    vendedor: nombre.get(t.created_by) ?? null,
  }));
}

export async function ejecutarTraspaso(
  origenId: string,
  destinoId: string,
  items: { product_id: string; qty: number }[],
  notas: string | null,
): Promise<ActionResult<string>> {
  return attempt("ejecutarTraspaso", async () => {
    await assertPermiso("inventario_gestionar");
    if (items.length === 0) throw new Error("Agrega al menos un producto");
    const insforge = await createInsForgeServerClient();
    const { data, error } = await insforge.database.rpc("ejecutar_traspaso", {
      p_origen: origenId,
      p_destino: destinoId,
      p_items: items,
      p_notas: notas,
    });
    if (error) throw new Error(error.message ?? "No se pudo traspasar");
    return String(data);
  });
}
