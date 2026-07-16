"use server";

import { headers } from "next/headers";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { createConektaOrder, type ConektaMethod } from "@/lib/conekta";
import { attempt, type ActionResult } from "@/lib/errors";
import { validarCarrito, type CartLinea } from "./checkout-actions";

export type DatosCliente = {
  nombre: string;
  email: string;
  telefono: string;
  cp: string;
  estado: string;
  municipio: string;
  direccion: string;
  referencias: string;
};

export type EnvioElegido = {
  proveedor: string;
  servicio: string;
  totalCents: number;
  dias: number | null;
};

export type ResultadoPago = {
  ordenId: string;
  folio: string;
  metodo: ConektaMethod;
  totalCents: number;
  /** OXXO */
  referencia?: string | null;
  barcodeUrl?: string | null;
  /** SPEI */
  clabe?: string | null;
  banco?: string | null;
  /** 3DS (card) / Aplazo redirect */
  redirectUrl?: string | null;
  pagada: boolean;
};

async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Creates our order (RESERVING stock), then charges it with Conekta. If Conekta
// fails we release the reserve immediately — otherwise a failed card attempt
// would strand inventory nobody can sell.
export async function crearOrdenYPagar(
  lineas: CartLinea[],
  cliente: DatosCliente,
  envio: EnvioElegido,
  metodo: ConektaMethod,
  cardTokenId?: string,
): Promise<ActionResult<ResultadoPago>> {
  return attempt("crearOrdenYPagar", async () => {
    // Re-price from the catalog; the client's numbers never reach Conekta.
    const val = await validarCarrito(lineas);
    if (!val.ok) throw new Error(val.error);
    const { lineas: items, subtotal_cents } = val.data;

    if (!Number.isInteger(envio.totalCents) || envio.totalCents < 0)
      throw new Error("Envío inválido");

    const { data, error } = await insforgeAdmin.database.rpc("crear_orden_web", {
      p_items: items.map((l) => ({ product_id: l.id, qty: l.qty })),
      p_nombre: cliente.nombre,
      p_email: cliente.email,
      p_telefono: cliente.telefono,
      p_cp: cliente.cp,
      p_estado: cliente.estado,
      p_municipio: cliente.municipio,
      p_direccion: cliente.direccion,
      p_referencias: cliente.referencias || null,
      p_envio_cents: envio.totalCents,
      p_envio_desc: `${envio.proveedor} · ${envio.servicio}${envio.dias ? ` · ${envio.dias} día(s)` : ""}`,
    });
    if (error) throw new Error(error.message ?? "No se pudo crear la orden");

    const row = (Array.isArray(data) ? data[0] : data) as
      | { orden_id: string; folio: string; subtotal_cents: number; total_cents: number }
      | undefined;
    if (!row?.orden_id) throw new Error("No se pudo crear la orden");

    const ordenId = row.orden_id;
    const totalCents = row.total_cents;

    // Sanity: the RPC recomputed the subtotal from the catalog. If it disagrees
    // with what we just validated, something moved underneath us — don't charge.
    if (row.subtotal_cents !== subtotal_cents) {
      await insforgeAdmin.database.rpc("cancelar_orden_web", { p_orden_id: ordenId });
      throw new Error("Los precios cambiaron. Vuelve a intentar.");
    }

    try {
      const url = await baseUrl();
      const co = await createConektaOrder({
        amountCents: totalCents,
        method: metodo,
        customer: {
          name: cliente.nombre,
          email: cliente.email,
          phone: cliente.telefono,
        },
        // Shipping rides as a line so Conekta's total matches ours exactly.
        lineItems: [
          ...items.map((l) => ({
            name: l.nombre,
            unit_price: l.precio_cents,
            quantity: l.qty,
          })),
          ...(envio.totalCents > 0
            ? [{ name: `Envío · ${envio.proveedor}`, unit_price: envio.totalCents, quantity: 1 }]
            : []),
        ],
        cardTokenId,
        orderNumber: row.folio,
        returnUrl: `${url}/tienda/orden/${ordenId}`,
        cancelUrl: `${url}/tienda/orden/${ordenId}?cancelado=1`,
      });

      await insforgeAdmin.database
        .from("ordenes_web")
        .update({ conekta_order_id: co.id, metodo })
        .eq("id", ordenId);

      const charge = co.charges?.data?.[0];
      const pm = charge?.payment_method;

      return {
        ordenId,
        folio: row.folio,
        metodo,
        totalCents,
        referencia: pm?.reference ?? null,
        barcodeUrl: pm?.barcode_url ?? null,
        clabe: pm?.receiving_account_number ?? null,
        banco: pm?.receiving_account_bank ?? null,
        redirectUrl: co.next_action?.redirect_to_url?.url ?? null,
        // The webhook is what actually commits the sale; this is just for the UI.
        pagada: co.payment_status === "paid",
      };
    } catch (e) {
      // Charge failed -> free the reserved pieces right away. Never let this
      // mask the real payment error.
      try {
        await insforgeAdmin.database.rpc("cancelar_orden_web", { p_orden_id: ordenId });
      } catch (releaseErr) {
        console.error("[crearOrdenYPagar] no se liberó la reserva", ordenId, releaseErr);
      }
      throw e;
    }
  });
}
