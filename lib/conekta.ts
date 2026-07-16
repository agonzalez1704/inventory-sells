import "server-only";
import { VOUCHER_HORAS_UI } from "@/modules/tienda/pago-const";

// Minimal Conekta REST wrapper (ported from the shoe store). Amounts in
// centavos, currency MXN. API version pinned via the Accept header.
const BASE = "https://api.conekta.io";
const API_VERSION = "application/vnd.conekta-v2.1.0+json";

/**
 * Voucher lifetime. Conekta's default is 30 DAYS — unusable here: crear_orden_web
 * RESERVES stock up front, so an unpaid voucher would freeze a piece for a month
 * with 1–6 units on hand. Conekta fires `order.expired` at this deadline and the
 * webhook releases the reserve. Shared with the UI copy so the two can't drift.
 */
export const VOUCHER_HORAS = VOUCHER_HORAS_UI;

function authHeader() {
  const key = process.env.CONEKTA_PRIVATE_KEY;
  if (!key) throw new Error("CONEKTA_PRIVATE_KEY missing");
  return "Basic " + Buffer.from(key + ":").toString("base64");
}

async function conekta<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      Authorization: authHeader(),
      Accept: API_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`conekta ${res.status}: ${JSON.stringify(body?.details ?? body)}`);
  }
  return body as T;
}

export type ConektaMethod = "card" | "oxxo" | "spei" | "aplazo";

export type ConektaCharge = {
  id: string;
  status?: string;
  payment_method: {
    type: string;
    // OXXO (type "cash")
    reference?: string;
    barcode_url?: string;
    // SPEI
    receiving_account_number?: string; // CLABE
    receiving_account_bank?: string;
    expires_at?: number;
  };
};

export type ConektaOrder = {
  id: string;
  payment_status: string; // 'paid' | 'pending_payment' | 'declined' | 'expired' | ...
  amount: number;
  charges?: { data: ConektaCharge[] };
  // 3DS challenge / BNPL redirect
  next_action?: {
    type?: string;
    redirect_to_url?: { url?: string; return_url?: string };
  };
};

type LineItem = { name: string; unit_price: number; quantity: number };

type CreateArgs = {
  amountCents: number;
  method: ConektaMethod;
  customer: { name: string; email: string; phone: string };
  lineItems: LineItem[];
  cardTokenId?: string; // from Conekta.js on the client
  orderNumber: string; // our folio -> Conekta metadata
  returnUrl?: string; // 3DS return (card) / success (aplazo)
  cancelUrl?: string; // aplazo cancel/failure
};

function paymentMethodBlock(a: CreateArgs, expiresAt: number) {
  switch (a.method) {
    case "card":
      if (!a.cardTokenId) throw new Error("Falta el token de la tarjeta");
      return { type: "card", token_id: a.cardTokenId };
    case "oxxo":
      return { type: "cash", expires_at: expiresAt }; // OXXO = cash
    case "spei":
      return { type: "spei", expires_at: expiresAt };
    case "aplazo": // BNPL — redirect to Aplazo to approve installments
      return {
        type: "bnpl",
        product_type: "aplazo_bnpl",
        success_url: a.returnUrl,
        failure_url: a.cancelUrl,
        cancel_url: a.cancelUrl,
      };
  }
}

export async function createConektaOrder(a: CreateArgs): Promise<ConektaOrder> {
  const expiresAt = Math.floor(Date.now() / 1000) + VOUCHER_HORAS * 3600;

  const body: Record<string, unknown> = {
    currency: "MXN",
    customer_info: {
      name: a.customer.name,
      email: a.customer.email,
      phone: a.customer.phone,
    },
    line_items: a.lineItems.map((li) => ({
      name: li.name.slice(0, 250),
      unit_price: li.unit_price,
      quantity: li.quantity,
    })),
    charges: [{ payment_method: paymentMethodBlock(a, expiresAt) }],
    // Our folio travels with the order so the webhook can always map back.
    metadata: { folio: a.orderNumber },
  };

  if (a.method === "card") {
    body.three_ds_mode = "smart"; // Conekta returns a challenge when needed
    if (a.returnUrl) body.return_url = a.returnUrl;
  }

  return conekta<ConektaOrder>("/orders", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Re-fetch to confirm real status — never trust a webhook payload. */
export async function getConektaOrder(orderId: string): Promise<ConektaOrder> {
  return conekta<ConektaOrder>(`/orders/${orderId}`);
}
