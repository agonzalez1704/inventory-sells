import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";

// Per-number draft order for the WhatsApp agent (R8): items accumulate across
// messages and the cotización is only created when the customer says that's
// everything. Persisted because tool results (the exact SKUs) don't survive in
// the chat history.
export type PedidoItem = { sku: string; nombre: string; qty: number; unit_mxn: number };

const VENTANA_MS = 6 * 3_600_000; // same session window as cargarHistorial

export async function cargarPedido(numero: string): Promise<PedidoItem[]> {
  const { data } = await insforgeAdmin.database
    .from("wa_pedidos")
    .select("items, updated_at")
    .eq("numero", numero)
    .maybeSingle();
  const row = data as { items: PedidoItem[]; updated_at: string } | null;
  if (!row) return [];
  if (Date.now() - +new Date(row.updated_at) > VENTANA_MS) return []; // stale draft
  return Array.isArray(row.items) ? row.items : [];
}

export async function guardarPedido(numero: string, items: PedidoItem[]): Promise<void> {
  // Overwrite-by-key without relying on PostgREST upsert semantics.
  await insforgeAdmin.database.from("wa_pedidos").delete().eq("numero", numero);
  await insforgeAdmin.database
    .from("wa_pedidos")
    .insert([{ numero, items, updated_at: new Date().toISOString() }]);
}

export async function limpiarPedido(numero: string): Promise<void> {
  await insforgeAdmin.database.from("wa_pedidos").delete().eq("numero", numero);
}
