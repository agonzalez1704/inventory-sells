import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";

// Per-number LIVE order for the WhatsApp agent: items accumulate across
// messages and are mirrored into a real cotización (created on the first
// concrete quote, edited in place afterwards — same folio, same share link).
// Persisted because tool results (the exact SKUs) don't survive in the
// text-only chat history.
export type PedidoItem = { sku: string; nombre: string; qty: number; unit_mxn: number };

export type Pedido = {
  items: PedidoItem[];
  cotizacionId: string | null;
  folio: string | null;
  shareToken: string | null;
};

const VACIO: Pedido = { items: [], cotizacionId: null, folio: null, shareToken: null };
const VENTANA_MS = 6 * 3_600_000; // same session window as cargarHistorial

export async function cargarPedido(numero: string): Promise<Pedido> {
  const { data } = await insforgeAdmin.database
    .from("wa_pedidos")
    .select("items, cotizacion_id, folio, share_token, updated_at")
    .eq("numero", numero)
    .maybeSingle();
  const row = data as
    | { items: PedidoItem[]; cotizacion_id: string | null; folio: string | null; share_token: string | null; updated_at: string }
    | null;
  if (!row) return { ...VACIO };
  if (Date.now() - +new Date(row.updated_at) > VENTANA_MS) return { ...VACIO }; // stale draft
  return {
    items: Array.isArray(row.items) ? row.items : [],
    cotizacionId: row.cotizacion_id,
    folio: row.folio,
    shareToken: row.share_token,
  };
}

export async function guardarPedido(numero: string, pedido: Pedido): Promise<void> {
  // Overwrite-by-key without relying on PostgREST upsert semantics.
  await insforgeAdmin.database.from("wa_pedidos").delete().eq("numero", numero);
  await insforgeAdmin.database.from("wa_pedidos").insert([
    {
      numero,
      items: pedido.items,
      cotizacion_id: pedido.cotizacionId,
      folio: pedido.folio,
      share_token: pedido.shareToken,
      updated_at: new Date().toISOString(),
    },
  ]);
}

export async function limpiarPedido(numero: string): Promise<void> {
  await insforgeAdmin.database.from("wa_pedidos").delete().eq("numero", numero);
}
