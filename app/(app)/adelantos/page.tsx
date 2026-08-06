import { createInsForgeServerClient } from "@/lib/insforge/server";
import {
  AdelantosView,
  type Adelanto,
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
  const [{ data, error }] = await Promise.all([
      insforge.database
        .from("adelantos")
        .select(
          "id, tipo, product_id, descripcion, qty, precio_cents, cliente, created_at, products(name, sku), adelanto_pagos(monto_cents, tipo)",
        )
        .eq("estado", "activo")
        .order("created_at", { ascending: true }),
    ]);

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
        <p className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error.message}
        </p>
      )}
      <AdelantosView adelantos={adelantos} />
    </>
  );
}
