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
    .select("id, folio, estado, customer_id, total_cents, notas, expires_at")
    .eq("share_token", token)
    .maybeSingle();
  const c = data as Row | null;
  if (!c || c.estado === "borrador") return null;

  const [{ data: itemData }, { data: cust }] = await Promise.all([
    insforgeAdmin.database
      .from("cotizacion_items")
      .select("nombre, sku, qty, unit_price_cents, line_total_cents")
      .eq("cotizacion_id", c.id),
    c.customer_id
      ? insforgeAdmin.database.from("customers").select("nombre").eq("id", c.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    cot: {
      folio: c.folio,
      estado: c.estado,
      cliente: c.customer_id ? (cust as { nombre: string } | null)?.nombre ?? null : null,
      total_cents: c.total_cents,
      notas: c.notas,
      expires_at: c.expires_at,
      vencida: Boolean(c.expires_at && new Date(c.expires_at) < new Date()),
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
