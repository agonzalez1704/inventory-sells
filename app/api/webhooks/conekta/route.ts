import { timingSafeEqual } from "node:crypto";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { getConektaOrder } from "@/lib/conekta";
import { notifyNuevaVenta } from "@/lib/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Conekta webhook — the ONLY place a web order becomes a sale.
//
// crear_orden_web reserves the stock and returns; nothing else commits. An OXXO
// voucher can sit unpaid for hours, so the money news arrives here, not in the
// request that created the order.
//
// Conekta signs webhooks, but the signature scheme is unavailable on this
// account's plan, so the endpoint is authenticated by a shared secret in the
// query string (?secret=...) — the URL is configured once in Conekta's panel and
// travels over TLS. That alone would let anyone who ever saw the URL forge a
// "paid", so the secret is not trusted on its own: the payload is treated as a
// hint and the real status is re-fetched from Conekta before anything commits.
// A forged body can at most make us re-read an order we already own.
//
// Always 200 on anything we understood but chose not to act on — a non-2xx makes
// Conekta retry the same event for days.

function secretOk(req: Request): boolean {
  const expected = process.env.CONEKTA_WEBHOOK_SECRET;
  if (!expected) return false;
  const got = new URL(req.url).searchParams.get("secret") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch — that itself leaks length, so
  // compare a fixed-size digest-like pair by length-checking first and bailing.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

type ConektaEvent = {
  type?: string;
  data?: { object?: { id?: string; metadata?: { folio?: string } } };
};

type OrdenRow = {
  id: string;
  folio: string;
  status: string;
  metodo: string | null;
  sale_id: string | null;
};

async function buscarOrden(
  conektaId: string,
  folio: string | undefined,
): Promise<OrdenRow | null> {
  const cols = "id, folio, status, metodo, sale_id";
  const { data } = await insforgeAdmin.database
    .from("ordenes_web")
    .select(cols)
    .eq("conekta_order_id", conektaId)
    .maybeSingle();
  if (data) return data as OrdenRow;

  // Fallback: the order row is updated with conekta_order_id right after the
  // charge, and Conekta can fire `order.paid` for a card before that write
  // lands. The folio rides in metadata precisely for this.
  if (!folio) return null;
  const { data: byFolio } = await insforgeAdmin.database
    .from("ordenes_web")
    .select(cols)
    .eq("folio", folio)
    .maybeSingle();
  return (byFolio as OrdenRow | null) ?? null;
}

export async function POST(req: Request) {
  if (!secretOk(req)) return new Response("unauthorized", { status: 401 });

  let ev: ConektaEvent;
  try {
    ev = (await req.json()) as ConektaEvent;
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const tipo = ev.type ?? "";
  const conektaId = ev.data?.object?.id;
  if (!conektaId) return Response.json({ ok: true, skipped: "sin id" });
  if (!["order.paid", "order.expired", "order.canceled"].includes(tipo)) {
    return Response.json({ ok: true, skipped: tipo });
  }

  try {
    const orden = await buscarOrden(conektaId, ev.data?.object?.metadata?.folio);
    if (!orden) {
      // Not ours (or a test event from the panel). 200 so Conekta stops.
      console.warn("[webhook:conekta] orden desconocida", tipo, conektaId);
      return Response.json({ ok: true, skipped: "orden no encontrada" });
    }

    // Never trust the payload's status — re-read from Conekta.
    const real = await getConektaOrder(conektaId);

    if (tipo === "order.paid") {
      if (real.payment_status !== "paid") {
        console.warn(
          "[webhook:conekta] order.paid pero Conekta dice",
          real.payment_status,
          orden.folio,
        );
        return Response.json({ ok: true, skipped: "no pagada" });
      }

      const { data: saleId, error } = await insforgeAdmin.database.rpc("pagar_orden_web", {
        p_orden_id: orden.id,
        p_conekta_id: conektaId,
        p_metodo: orden.metodo ?? "card",
      });
      if (error) throw new Error(error.message ?? String(error));

      // Only announce a sale we just created. pagar_orden_web is idempotent and
      // returns the existing sale_id on a re-delivery, so gate on the order
      // having still been pending — otherwise Conekta's retries re-notify.
      if (orden.status === "pendiente" && saleId) {
        await notifyNuevaVenta(String(saleId), "venta");
      }
      return Response.json({ ok: true, folio: orden.folio, saleId });
    }

    // expired / canceled -> release the reserved pieces.
    if (real.payment_status === "paid") {
      // Paid after all; releasing stock here would oversell.
      console.warn("[webhook:conekta] ignoro", tipo, "— ya pagada", orden.folio);
      return Response.json({ ok: true, skipped: "pagada" });
    }
    const { error } = await insforgeAdmin.database.rpc("cancelar_orden_web", {
      p_orden_id: orden.id,
    });
    if (error) throw new Error(error.message ?? String(error));
    return Response.json({ ok: true, folio: orden.folio, cancelada: true });
  } catch (e) {
    // 500 so Conekta retries — a dropped `order.paid` means a customer paid and
    // never got their order.
    console.error("[webhook:conekta]", tipo, conektaId, e);
    return new Response("error", { status: 500 });
  }
}
