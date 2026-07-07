import { createInsForgeServerClient } from "@/lib/insforge/server";
import {
  AdelantosView,
  type Adelanto,
  type AdelantoProducto,
} from "@/modules/adelantos/AdelantosView";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  tipo: "apartado" | "pedido";
  product_id: string | null;
  descripcion: string | null;
  qty: number;
  precio_cents: number;
  cliente: string | null;
  created_at: string;
  products: { name: string; sku: string } | null;
  adelanto_pagos: { monto_cents: number; tipo: "abono" | "devolucion" }[];
};

export default async function AdelantosPage() {
  const insforge = await createInsForgeServerClient();
  const [{ data, error }, { data: prodData }, { data: invData }] =
    await Promise.all([
      insforge.database
        .from("adelantos")
        .select(
          "id, tipo, product_id, descripcion, qty, precio_cents, cliente, created_at, products(name, sku), adelanto_pagos(monto_cents, tipo)",
        )
        .eq("estado", "activo")
        .order("created_at", { ascending: true }),
      insforge.database
        .from("products")
        .select("id, inventory_id, sku, name, size, price_cents, quantity")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      insforge.database.from("inventories").select("id, name"),
    ]);

  const invName = new Map(
    ((invData ?? []) as { id: string; name: string }[]).map((i) => [i.id, i.name]),
  );
  const products = (
    (prodData ?? []) as (AdelantoProducto & { inventory_id: string })[]
  ).map((p) => ({ ...p, inventory_name: invName.get(p.inventory_id) ?? null }));

  const adelantos: Adelanto[] = ((data ?? []) as unknown as Row[]).map((r) => {
    const pagado = (r.adelanto_pagos ?? []).reduce(
      (s, p) => s + (p.tipo === "abono" ? p.monto_cents : -p.monto_cents),
      0,
    );
    return {
      id: r.id,
      tipo: r.tipo,
      nombre: r.products?.name ?? r.descripcion ?? "—",
      sku: r.products?.sku ?? null,
      qty: r.qty,
      precio_cents: r.precio_cents,
      cliente: r.cliente,
      created_at: r.created_at,
      pagado_cents: pagado,
    };
  });

  return (
    <>
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}
      <AdelantosView adelantos={adelantos} products={products} />
    </>
  );
}
