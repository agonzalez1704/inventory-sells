import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";

// The conversation's live quote. There is no separate draft: the cotización IS
// the order, so what the customer sees at the link and what the agent believes
// they carry can never drift apart. Creating/editing goes through the SQL
// functions, which hold an advisory lock per phone — the model calls the add
// tool once per product in PARALLEL, and doing this in app code created one
// quote per call instead of one per conversation.
export type PedidoItem = { sku: string; nombre: string; qty: number; unit_mxn: number };

export type Pedido = {
  items: PedidoItem[];
  cotizacionId: string | null;
  folio: string | null;
  shareToken: string | null;
};

const VACIO: Pedido = { items: [], cotizacionId: null, folio: null, shareToken: null };

const urlBase = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
export const urlCotizacion = (token: string) => `${urlBase()}/cotizacion#${token}`;

type CotRow = {
  id: string;
  folio: string;
  share_token: string;
  cotizacion_items: { sku: string; nombre: string; qty: number; unit_price_cents: number }[] | null;
};

// Read-only view of the live quote (same 6h window the SQL uses).
export async function cargarPedido(numero: string): Promise<Pedido> {
  const desde = new Date(Date.now() - 6 * 3_600_000).toISOString();
  const { data } = await insforgeAdmin.database
    .from("cotizaciones")
    .select("id, folio, share_token, cotizacion_items(sku, nombre, qty, unit_price_cents)")
    .eq("canal", "whatsapp")
    .eq("estado", "pendiente")
    .eq("notas", `WhatsApp: ${numero}`)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = (data as CotRow[] | null)?.[0];
  if (!row) return { ...VACIO };
  return {
    items: (row.cotizacion_items ?? []).map((i) => ({
      sku: i.sku,
      nombre: i.nombre,
      qty: i.qty,
      unit_mxn: i.unit_price_cents / 100,
    })),
    cotizacionId: row.id,
    folio: row.folio,
    shareToken: row.share_token,
  };
}

type SyncRow = { id: string; folio: string; share_token: string; total_cents: number; creada?: boolean };

// Add items (qty = total wanted per SKU) to the live quote, creating it on
// first use. Atomic and commutative: two parallel calls end with both products
// in ONE quote regardless of order.
export async function agregarACotizacion(
  numero: string,
  items: { sku: string; qty: number }[],
): Promise<{ folio: string; url: string; totalMxn: number; creada: boolean } | { error: string }> {
  try {
    const { data, error } = await insforgeAdmin.database.rpc("agregar_a_cotizacion_whatsapp", {
      p_telefono: numero,
      p_items: items,
    });
    if (error) return { error: error.message ?? "no se pudo agregar" };
    const row = (Array.isArray(data) ? data[0] : data) as SyncRow | undefined;
    if (!row?.id) return { error: "no se pudo agregar" };
    return {
      folio: row.folio,
      url: urlCotizacion(row.share_token),
      totalMxn: row.total_cents / 100,
      creada: !!row.creada,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
}

export async function quitarDeCotizacion(
  numero: string,
  sku: string | null,
  todo: boolean,
): Promise<{ folio: string; url: string; totalMxn: number } | { error: string }> {
  try {
    const { data, error } = await insforgeAdmin.database.rpc("quitar_de_cotizacion_whatsapp", {
      p_telefono: numero,
      p_sku: sku,
      p_todo: todo,
    });
    if (error) return { error: error.message ?? "no se pudo quitar" };
    const row = (Array.isArray(data) ? data[0] : data) as SyncRow | undefined;
    if (!row?.id) return { error: "sin cotización activa" };
    return { folio: row.folio, url: urlCotizacion(row.share_token), totalMxn: row.total_cents / 100 };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "error" };
  }
}
