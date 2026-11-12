import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";

// The conversation's live quotes, one per almacén: Mostrador's goes out today,
// Guadalajara's arrives by route or exprés at its own price, and each has its
// own folio, link and payment. There is no separate draft: the cotización IS
// the order, so what the customer sees at the link and what the agent believes
// they carry can never drift apart. Creating/editing goes through the SQL
// functions, which hold an advisory lock per phone — the model calls the add
// tool once per product in PARALLEL, and doing this in app code created one
// quote per call instead of one per conversation.
export type PedidoItem = { sku: string; nombre: string; qty: number; unit_mxn: number; almacen: string };

export type CotViva = {
  id: string;
  folio: string;
  shareToken: string;
  url: string;
  almacen: string;
  esMostrador: boolean;
  entrega: "ruta" | "expres" | null;
  entregaFecha: string | null;
  cargoMxn: number;
  totalMxn: number;
  items: PedidoItem[];
};

export type Pedido = {
  /** Every piece, across quotes. */
  items: PedidoItem[];
  /** The quotes with pieces, Mostrador first. */
  cotizaciones: CotViva[];
  /** The first of them: kept for callers that speak of one quote. */
  cotizacionId: string | null;
  folio: string | null;
  shareToken: string | null;
};

const VACIO: Pedido = { items: [], cotizaciones: [], cotizacionId: null, folio: null, shareToken: null };

export const urlBase = () => (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
export const urlCotizacion = (token: string) => `${urlBase()}/cotizacion#${token}`;

type CotRow = {
  id: string;
  folio: string;
  share_token: string;
  inventory_id: string | null;
  entrega: "ruta" | "expres" | null;
  entrega_fecha: string | null;
  cargo_expres_cents: number | null;
  total_cents: number;
  created_at: string;
  inventories: { name: string } | null;
  cotizacion_items: { sku: string; nombre: string; qty: number; unit_price_cents: number }[] | null;
};

// Read-only view of the live quotes (same 6h window the SQL uses).
export async function cargarPedido(numero: string): Promise<Pedido> {
  const desde = new Date(Date.now() - 6 * 3_600_000).toISOString();
  const [{ data }, { data: invs }] = await Promise.all([
    insforgeAdmin.database
      .from("cotizaciones")
      .select(
        "id, folio, share_token, inventory_id, entrega, entrega_fecha, cargo_expres_cents, total_cents, created_at, inventories(name), cotizacion_items(sku, nombre, qty, unit_price_cents)",
      )
      .eq("canal", "whatsapp")
      .eq("estado", "pendiente")
      .eq("notas", `WhatsApp: ${numero}`)
      .gte("created_at", desde)
      .order("created_at", { ascending: true }),
    insforgeAdmin.database.from("inventories").select("id, name").order("created_at").limit(1),
  ]);
  const mostrador = (invs as { id: string; name: string }[] | null)?.[0];
  const cotizaciones = ((data ?? []) as unknown as CotRow[])
    .map((r): CotViva => {
      const esMostrador = !r.inventory_id || r.inventory_id === mostrador?.id;
      const almacen = r.inventories?.name ?? mostrador?.name ?? "Mostrador";
      return {
        id: r.id,
        folio: r.folio,
        shareToken: r.share_token,
        url: urlCotizacion(r.share_token),
        almacen,
        esMostrador,
        entrega: r.entrega,
        entregaFecha: r.entrega_fecha,
        cargoMxn: (r.cargo_expres_cents ?? 0) / 100,
        totalMxn: r.total_cents / 100,
        items: (r.cotizacion_items ?? []).map((i) => ({
          sku: i.sku,
          nombre: i.nombre,
          qty: i.qty,
          unit_mxn: i.unit_price_cents / 100,
          almacen,
        })),
      };
    })
    .filter((c) => c.items.length > 0)
    .sort((a, b) => Number(b.esMostrador) - Number(a.esMostrador));
  if (!cotizaciones.length) return { ...VACIO };
  const [primera] = cotizaciones;
  return {
    items: cotizaciones.flatMap((c) => c.items),
    cotizaciones,
    cotizacionId: primera.id,
    folio: primera.folio,
    shareToken: primera.shareToken,
  };
}

/** What a tool hands the model: one entry per quote, with its own link. */
export const resumenCotizaciones = (p: Pedido) =>
  p.cotizaciones.map((c) => ({
    almacen: c.esMostrador ? `${c.almacen} (entrega hoy)` : `Sobrepedido ${c.almacen}`,
    folio: c.folio,
    url: c.url,
    ...(c.entrega ? { entrega: `${c.entrega === "expres" ? "exprés" : "ruta"}, llega ${c.entregaFecha ?? "por confirmar"}` } : {}),
    piezas: c.items.map((i) => ({ nombre: i.nombre, qty: i.qty, unit_mxn: i.unit_mxn })),
    ...(c.cargoMxn > 0 ? { servicio_expres_mxn: c.cargoMxn } : {}),
    total_mxn: c.totalMxn,
  }));

type SyncRow = { id: string; folio: string; share_token: string; total_cents: number; creada?: boolean; almacen?: string };

// Add items (qty = total wanted per SKU) to the live quote, creating it on
// first use. Atomic and commutative: two parallel calls end with both products
// in ONE quote regardless of order.
export async function agregarACotizacion(
  numero: string,
  // product_id pins the almacén row; a bare sku lets SQL pick the first one.
  // entrega/fecha/corte: how that almacén's quote arrives (the customer's pick).
  items: { sku?: string; product_id?: string; qty: number; entrega?: "ruta" | "expres"; fecha?: string; corte?: string }[],
): Promise<{ folio: string; url: string; totalMxn: number; creada: boolean; creadas: string[] } | { error: string }> {
  try {
    const { data, error } = await insforgeAdmin.database.rpc("agregar_a_cotizacion_whatsapp", {
      p_telefono: numero,
      p_items: items,
    });
    if (error) return { error: error.message ?? "no se pudo agregar" };
    // One row per live quote (one per almacén), Mostrador first.
    const rows = (Array.isArray(data) ? data : [data]).filter(Boolean) as SyncRow[];
    const row = rows[0];
    if (!row?.id) return { error: "no se pudo agregar" };
    return {
      folio: row.folio,
      url: urlCotizacion(row.share_token),
      totalMxn: row.total_cents / 100,
      creada: rows.some((r) => r.creada),
      creadas: rows.filter((r) => r.creada).map((r) => r.id),
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
