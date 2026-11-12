"use server";

import { insforgeAdmin } from "@/lib/insforge/admin";
import { notifyCotizacionAutorizada } from "@/lib/push";
import { attempt, type ActionResult } from "@/lib/errors";

export type CotPublicaItem = {
  nombre: string;
  sku: string | null;
  qty: number;
  unit_price_cents: number;
  line_total_cents: number;
};

export type CotPublica = {
  folio: string;
  estado: string;
  cliente: string | null;
  total_cents: number;
  notas: string | null;
  expires_at: string | null;
  vencida: boolean;
  /** Pieces from another almacén than the counter: arrives on a date, not today. */
  sobrepedido: boolean;
  almacen: string | null;
  entrega: "ruta" | "expres" | null;
  entrega_fecha: string | null;
  pedir_antes: string | null;
  cargo_expres_cents: number;
  /** The same conversation's other quotes (one per almacén), each paid on its own link. */
  otras: { folio: string; almacen: string; sobrepedido: boolean; total_cents: number; token: string }[];
};

export type CotPublicaData = { cot: CotPublica; items: CotPublicaItem[] };

type Row = {
  id: string;
  folio: string;
  estado: string;
  customer_id: string | null;
  total_cents: number;
  notas: string | null;
  expires_at: string | null;
  canal: string | null;
  created_at: string;
  inventory_id: string | null;
  entrega: "ruta" | "expres" | null;
  entrega_fecha: string | null;
  pedir_antes: string | null;
  cargo_expres_cents: number | null;
  inventories: { name: string } | null;
};

// Customer-facing: NO auth. The share_token arrives in the POST body (the link
// carries it in the URL fragment, which browsers never send to the server), so
// it never lands in access logs / Referer. Only customer-safe fields are read —
// no costs, margin, vendedor or created_by ever reach the client. Returns null
// for a bad token or a not-yet-sent (borrador) quote.
export async function cargarCotizacionPublica(token: string): Promise<CotPublicaData | null> {
  if (!token) return null;

  const { data } = await insforgeAdmin.database
    .from("cotizaciones")
    .select(
      "id, folio, estado, customer_id, total_cents, notas, expires_at, canal, created_at, inventory_id, entrega, entrega_fecha, pedir_antes, cargo_expres_cents, inventories(name)",
    )
    .eq("share_token", token)
    .maybeSingle();
  const c = data as unknown as Row | null;
  if (!c || c.estado === "borrador") return null;

  // A WhatsApp conversation gets one quote per almacén: show the others.
  const hermanas = c.canal === "whatsapp" && c.notas?.startsWith("WhatsApp:");
  const [{ data: itemData }, { data: cust }, { data: invs }, { data: otrasData }] = await Promise.all([
    insforgeAdmin.database
      .from("cotizacion_items")
      .select("nombre, sku, qty, unit_price_cents, line_total_cents")
      .eq("cotizacion_id", c.id),
    c.customer_id
      ? insforgeAdmin.database.from("customers").select("nombre").eq("id", c.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    insforgeAdmin.database.from("inventories").select("id, name").order("created_at").limit(1),
    hermanas
      ? insforgeAdmin.database
          .from("cotizaciones")
          .select("id, folio, share_token, total_cents, inventory_id, inventories(name)")
          .eq("canal", "whatsapp")
          .eq("notas", c.notas!)
          .in("estado", ["pendiente", "autorizada"])
          .neq("id", c.id)
          .gt("total_cents", 0)
          .gte("created_at", new Date(new Date(c.created_at).getTime() - 86_400_000).toISOString())
      : Promise.resolve({ data: [] }),
  ]);
  const mostrador = (invs as { id: string; name: string }[] | null)?.[0];
  const esOtro = (inv: string | null) => !!inv && inv !== mostrador?.id;

  return {
    cot: {
      folio: c.folio,
      estado: c.estado,
      cliente: c.customer_id ? (cust as { nombre: string } | null)?.nombre ?? null : null,
      total_cents: c.total_cents,
      notas: c.notas,
      expires_at: c.expires_at,
      vencida: Boolean(c.expires_at && new Date(c.expires_at) < new Date()),
      sobrepedido: esOtro(c.inventory_id),
      almacen: c.inventories?.name ?? null,
      entrega: c.entrega,
      entrega_fecha: c.entrega_fecha,
      pedir_antes: c.pedir_antes,
      cargo_expres_cents: c.cargo_expres_cents ?? 0,
      otras: ((otrasData ?? []) as unknown as {
        folio: string;
        share_token: string;
        total_cents: number;
        inventory_id: string | null;
        inventories: { name: string } | null;
      }[]).map((o) => ({
        folio: o.folio,
        almacen: o.inventories?.name ?? mostrador?.name ?? "Mostrador",
        sobrepedido: esOtro(o.inventory_id),
        total_cents: o.total_cents,
        token: o.share_token,
      })),
    },
    items: (itemData ?? []) as CotPublicaItem[],
  };
}

// Authorize by token — token in the POST body (never the URL). Only the one
// transition pendiente → autorizada, idempotent, expiry- and concurrency-guarded.
export async function aceptarCotizacionPublica(token: string): Promise<ActionResult<null>> {
  return attempt("aceptarCotizacionPublica", async () => {
    if (!token) throw new Error("Enlace inválido");

    const { data: cur } = await insforgeAdmin.database
      .from("cotizaciones")
      .select("id, estado, expires_at")
      .eq("share_token", token)
      .maybeSingle();
    const c = cur as { id: string; estado: string; expires_at: string | null } | null;
    if (!c) throw new Error("Cotización no encontrada");
    if (c.estado === "autorizada") return null; // idempotent
    if (c.estado !== "pendiente") throw new Error("Esta cotización ya no está disponible");
    if (c.expires_at && new Date(c.expires_at) < new Date()) throw new Error("Esta cotización venció");

    const nowIso = new Date().toISOString();
    // Guard on estado='pendiente' so a double-click / concurrent staff action
    // can't double-transition; if another writer already flipped it, treat as done.
    const { data, error } = await insforgeAdmin.database
      .from("cotizaciones")
      .update({ estado: "autorizada", autorizada_at: nowIso, updated_at: nowIso })
      .eq("share_token", token)
      .eq("estado", "pendiente")
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message ?? "No se pudo autorizar");
    if (!data) return null; // someone else authorized it first

    await notifyCotizacionAutorizada(c.id);
    return null;
  });
}

// --- Pago desde la cotización -----------------------------------------------

export type DatosEntrega = {
  nombre: string;
  email: string;
  telefono: string;
  tipoEntrega: "recoger" | "envio";
  cp?: string;
  estado?: string;
  municipio?: string;
  direccion?: string;
  referencias?: string;
  envio?: { totalCents: number; proveedor: string; servicio: string; dias: number | null } | null;
};

/**
 * The quote becomes a payable web order — same reservation rules as the
 * storefront, but at the QUOTED prices (the deal the agent made, discount
 * included). Public: the share token is the capability. Idempotent per quote.
 */
export async function pagarCotizacion(
  token: string,
  datos: DatosEntrega,
): Promise<ActionResult<{ ordenId: string; folio: string }>> {
  return attempt("pagarCotizacion", async () => {
    const recoger = datos.tipoEntrega === "recoger";
    if (!recoger && !datos.envio) throw new Error("Falta elegir la paquetería");
    const { data, error } = await insforgeAdmin.database.rpc("crear_orden_desde_cotizacion", {
      p_token: token,
      p_nombre: datos.nombre,
      p_email: datos.email,
      p_telefono: datos.telefono,
      p_cp: recoger ? null : datos.cp ?? null,
      p_estado: recoger ? null : datos.estado ?? null,
      p_municipio: recoger ? null : datos.municipio ?? null,
      p_direccion: recoger ? null : datos.direccion ?? null,
      p_referencias: datos.referencias ?? null,
      p_envio_cents: recoger ? 0 : datos.envio!.totalCents,
      p_envio_desc: recoger
        ? "Recoger en tienda"
        : `${datos.envio!.proveedor} · ${datos.envio!.servicio}${datos.envio!.dias ? ` · ${datos.envio!.dias} día(s)` : ""}`,
      p_tipo_entrega: datos.tipoEntrega,
    });
    if (error) throw new Error(error.message ?? "No se pudo generar la orden");
    const row = (Array.isArray(data) ? data[0] : data) as { orden_id: string; folio: string };
    // The order is set to pay by transfer — the confirmation page carries the
    // bank data, exactly like the storefront's transferencia path.
    await insforgeAdmin.database
      .from("ordenes_web")
      .update({ metodo: "transferencia" })
      .eq("id", row.orden_id)
      .is("metodo", null);
    return { ordenId: row.orden_id, folio: row.folio };
  });
}
