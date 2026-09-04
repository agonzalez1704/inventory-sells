"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { notifyAdmins } from "@/lib/push";
import { MARCA } from "@/lib/marca";
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

export type TipoEntrega = "envio" | "recoger";

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

/** Direct bank transfer — no Conekta. Order sits pendiente until an admin
 *  confirms the deposit; the confirmation page shows the bank data + folio. */
export type ResultadoTransferencia = {
  ordenId: string;
  folio: string;
  totalCents: number;
};

async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Shared order creation: re-price, reserve stock, sanity-check the subtotal.
// Both the Conekta path and the direct-transfer path start here so the reserve
// and re-pricing rules can't drift between them.
async function crearOrden(
  lineas: CartLinea[],
  cliente: DatosCliente,
  tipoEntrega: TipoEntrega,
  envio: EnvioElegido | null,
): Promise<{
  ordenId: string;
  folio: string;
  totalCents: number;
  items: { id: string; nombre: string; precio_cents: number; qty: number }[];
}> {
  const val = await validarCarrito(lineas);
  if (!val.ok) throw new Error(val.error);
  const { lineas: items, subtotal_cents, piezas_fisicas } = val.data;

  // No rate is only legitimate when nothing ships from us: pickup, or a cart
  // that is 100% dropship (the supplier's shipping rides in the price). A
  // physical parcel with no chosen rate would ship free by client fiat.
  const soloDropship = piezas_fisicas === 0;
  if (tipoEntrega === "envio" && !soloDropship && !envio)
    throw new Error("Falta elegir la paquetería");

  const envioCents = tipoEntrega === "recoger" || soloDropship ? 0 : envio?.totalCents ?? 0;
  if (!Number.isInteger(envioCents) || envioCents < 0) throw new Error("Envío inválido");
  const envioDesc =
    tipoEntrega === "recoger"
      ? "Recoger en tienda"
      : soloDropship
        ? "Directo del proveedor"
        : `${envio!.proveedor} · ${envio!.servicio}${envio!.dias ? ` · ${envio!.dias} día(s)` : ""}`;

  const { data, error } = await insforgeAdmin.database.rpc("crear_orden_web", {
    p_items: items.map((l) => ({ product_id: l.id, qty: l.qty })),
    p_nombre: cliente.nombre,
    p_email: cliente.email,
    p_telefono: cliente.telefono,
    p_cp: cliente.cp || null,
    p_estado: cliente.estado || null,
    p_municipio: cliente.municipio || null,
    p_direccion: cliente.direccion || null,
    p_referencias: cliente.referencias || null,
    p_envio_cents: envioCents,
    p_envio_desc: envioDesc,
    p_tipo_entrega: tipoEntrega,
  });
  if (error) throw new Error(error.message ?? "No se pudo crear la orden");

  const row = (Array.isArray(data) ? data[0] : data) as
    | { orden_id: string; folio: string; subtotal_cents: number; total_cents: number }
    | undefined;
  if (!row?.orden_id) throw new Error("No se pudo crear la orden");

  // The RPC recomputed the subtotal from the catalog; a mismatch means prices
  // moved under us — release the reserve, don't proceed.
  if (row.subtotal_cents !== subtotal_cents) {
    await insforgeAdmin.database.rpc("cancelar_orden_web", { p_orden_id: row.orden_id });
    throw new Error("Los precios cambiaron. Vuelve a intentar.");
  }

  return { ordenId: row.orden_id, folio: row.folio, totalCents: row.total_cents, items };
}

// Creates our order (RESERVING stock), then charges it with Conekta. If Conekta
// fails we release the reserve immediately — otherwise a failed card attempt
// would strand inventory nobody can sell. `envio` is null for a pickup.
export async function crearOrdenYPagar(
  lineas: CartLinea[],
  cliente: DatosCliente,
  envio: EnvioElegido | null,
  metodo: ConektaMethod,
  tipoEntrega: TipoEntrega,
  cardTokenId?: string,
): Promise<ActionResult<ResultadoPago>> {
  return attempt("crearOrdenYPagar", async () => {
    const { ordenId, folio, totalCents, items } = await crearOrden(
      lineas,
      cliente,
      tipoEntrega,
      envio,
    );
    const envioCents = tipoEntrega === "recoger" ? 0 : envio?.totalCents ?? 0;

    try {
      const url = await baseUrl();
      const co = await createConektaOrder({
        amountCents: totalCents,
        method: metodo,
        customer: { name: cliente.nombre, email: cliente.email, phone: cliente.telefono },
        // Shipping rides as a line so Conekta's total matches ours exactly.
        lineItems: [
          ...items.map((l) => ({ name: l.nombre, unit_price: l.precio_cents, quantity: l.qty })),
          ...(envioCents > 0 && envio
            ? [{ name: `Envío · ${envio.proveedor}`, unit_price: envioCents, quantity: 1 }]
            : []),
        ],
        cardTokenId,
        orderNumber: folio,
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
        folio,
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

// Direct bank transfer: reserve the order, mark the method, and stop. No charge
// is created — the deposit lands in the store's own account and an admin
// confirms it from the panel, which is what finally commits the sale. Stock
// stays reserved meanwhile.
// ponytail: unpaid direct-transfer orders hold stock until an admin cancels
// them — no auto-expiry yet. Add a cron to release stale pendientes if the
// reservation surface ever gets abused.
export async function crearOrdenTransferencia(
  lineas: CartLinea[],
  cliente: DatosCliente,
  envio: EnvioElegido | null,
  tipoEntrega: TipoEntrega,
): Promise<ActionResult<ResultadoTransferencia>> {
  return attempt("crearOrdenTransferencia", async () => {
    const { ordenId, folio, totalCents } = await crearOrden(lineas, cliente, tipoEntrega, envio);
    await insforgeAdmin.database
      .from("ordenes_web")
      .update({ metodo: "transferencia" })
      .eq("id", ordenId);
    return { ordenId, folio, totalCents };
  });
}

/**
 * The customer's own transfer proof, uploaded from the public order page. No
 * session — the order id is the capability, and it only works while the order
 * is a pending transfer. Admins get pinged: this is the moment somebody can
 * confirm the deposit with one click instead of hunting for it.
 */
export async function subirComprobanteOrden(
  ordenId: string,
  referencia: string | null,
  form?: FormData,
  cuentaId?: string | null,
): Promise<ActionResult<null>> {
  return attempt("subirComprobanteOrden", async () => {
    const { data } = await insforgeAdmin.database
      .from("ordenes_web")
      .select("id, folio, status, metodo")
      .eq("id", ordenId)
      .maybeSingle();
    const o = data as { id: string; folio: string; status: string; metodo: string | null } | null;
    if (!o || o.status !== "pendiente" || o.metodo !== "transferencia")
      throw new Error("Esta orden no está esperando una transferencia");

    const ref = referencia?.trim() || null;
    const file = form?.get("file");
    const conImagen = file instanceof File && file.size > 0;
    if (!ref && !conImagen) throw new Error("Escribe la referencia o adjunta tu captura");

    let key: string | null = null;
    if (conImagen) {
      if (file.size > 8 * 1024 * 1024) throw new Error("La imagen pesa más de 8 MB");
      const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
      if (!ext) throw new Error("Formato no válido (usa JPG o PNG)");
      key = `orden-${ordenId}/${crypto.randomUUID()}.${ext}`;
      const { data: up, error } = await insforgeAdmin.storage.from("comprobantes").upload(key, file);
      if (error || !up) throw new Error(error?.message ?? "No se pudo subir la captura");
      key = up.key;
    }

    const { error } = await insforgeAdmin.database.from("comprobantes_pago").insert([
      {
        orden_id: ordenId,
        referencia: ref,
        imagen_key: key,
        cuenta_id: cuentaId ?? null,
        created_by: "cliente-web",
      },
    ]);
    if (error) throw new Error(error.message ?? "No se pudo guardar");

    // "venta" recipients are whoever cares about money landing — the right
    // audience for a deposit waiting on a one-click confirmation.
    after(() =>
      notifyAdmins("venta", {
        title: "Transferencia por confirmar",
        body: `${o.folio}: el cliente envió su comprobante. Confírmala en Pedidos.`,
        url: "/pedidos",
        tag: `comprobante-${o.id}`,
        icon: MARCA.icono,
      }),
    );
    return null;
  });
}
