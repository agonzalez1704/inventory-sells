"use server";

import { auth } from "@clerk/nextjs/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { getPermisos } from "@/lib/auth/profile";
import { attempt, type ActionResult } from "@/lib/errors";
import { inventarioQueRecibe } from "@/modules/inventory/solo-consulta";

export type PiezaPedido = {
  /** Our own row for the SKU: the adelanto is on it, the supplier's invoice fills it. */
  productId: string;
  nombre: string;
  precio_cents: number;
  /** What the supplier's solo-consulta inventory has (Grob). */
  enProveedor: number;
  proveedor: string;
};

type Fila = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string | null;
  familia: string | null;
  familia_fija: boolean | null;
  sistema: string | null;
  descripcion: string | null;
  image_url: string | null;
  price_cents: number;
  cost_cents: number;
  quantity: number;
  is_active: boolean;
  inventory_id: string;
  inventories: { name: string; solo_consulta: boolean | null; es_dropship: boolean | null } | null;
};
const CAMPOS =
  "id, sku, name, brand, category, familia, familia_fija, sistema, descripcion, image_url, price_cents, cost_cents, quantity, is_active, inventory_id, inventories(name, solo_consulta, es_dropship)";

/**
 * A part seen in a supplier's solo-consulta inventory (Grob), sold bajo pedido.
 * Nothing is sold from the supplier's row: the sale is an adelanto 'pedido' on
 * OUR row of the same SKU, which reserves nothing and is delivered once the
 * supplier's invoice puts the piece there. A SKU we never stocked gets its own
 * row first, at 0 pieces, copied from the supplier's.
 */
export async function piezaParaPedido(productId: string): Promise<ActionResult<PiezaPedido>> {
  return attempt("piezaParaPedido", async () => {
    const { userId } = await auth();
    if (!userId) throw new Error("No autenticado");
    const perms = await getPermisos(userId);
    if (!perms.has("admin_total") && !perms.has("pos_vender")) throw new Error("Sin permiso");

    const DB = insforgeAdmin.database;
    const { data } = await DB.from("products").select(CAMPOS).eq("id", productId).maybeSingle();
    const ajena = data as unknown as Fila | null;
    if (!ajena) throw new Error("No encontré esa pieza");
    if (!ajena.inventories?.solo_consulta) throw new Error("Esa pieza se vende directo, no bajo pedido");

    const { data: hermanas } = await DB.from("products").select(CAMPOS).eq("sku", ajena.sku);
    const propia = ((hermanas ?? []) as unknown as Fila[])
      .filter((p) => !p.inventories?.solo_consulta && !p.inventories?.es_dropship)
      .sort((a, b) => Number(b.is_active) - Number(a.is_active) || b.price_cents - a.price_cents)[0];

    const precio = propia?.price_cents || ajena.price_cents;
    if (!precio) throw new Error(`${ajena.name} no tiene precio. Ponle precio en Catálogo antes de pedirla.`);

    let id = propia?.id;
    if (propia && !propia.is_active) await DB.from("products").update({ is_active: true }).eq("id", propia.id);
    if (!id) {
      const destino = await inventarioQueRecibe();
      const { data: nueva, error } = await DB.from("products")
        .insert([
          {
            sku: ajena.sku,
            name: ajena.name,
            brand: ajena.brand,
            category: ajena.category,
            familia: ajena.familia,
            familia_fija: ajena.familia_fija ?? false,
            sistema: ajena.sistema,
            descripcion: ajena.descripcion,
            image_url: ajena.image_url,
            inventory_id: destino,
            quantity: 0,
            price_cents: precio,
            cost_cents: ajena.cost_cents ?? 0,
            is_active: true,
            created_by: userId,
          },
        ])
        .select("id")
        .single();
      if (error || !nueva) throw new Error(error?.message ?? "No se pudo dar de alta la pieza");
      id = (nueva as { id: string }).id;
    }

    return {
      productId: id,
      nombre: ajena.name,
      precio_cents: precio,
      enProveedor: ajena.quantity,
      proveedor: ajena.inventories?.name ?? "el proveedor",
    };
  });
}
