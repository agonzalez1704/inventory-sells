import "server-only";
import webpush from "web-push";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { formatMXN } from "@/lib/money";

let configured: boolean | null = null;
function configure(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@fiable.app";
  configured = Boolean(pub && priv);
  if (configured) webpush.setVapidDetails(subject, pub!, priv!);
  return configured;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

// Push to every admin's subscribed devices. Best-effort: prunes dead
// subscriptions (404/410) and never throws.
export async function notifyAdmins(payload: PushPayload): Promise<void> {
  if (!configure()) return;

  const { data: admins } = await insforgeAdmin.database
    .from("profiles")
    .select("id")
    .eq("role", "admin");
  const ids = ((admins ?? []) as { id: string }[]).map((a) => a.id);
  if (!ids.length) return;

  const { data: subs } = await insforgeAdmin.database
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", ids);
  const rows = (subs ?? []) as {
    id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }[];
  if (!rows.length) return;

  const msg = JSON.stringify(payload);
  await Promise.all(
    rows.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          msg,
        );
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await insforgeAdmin.database
            .from("push_subscriptions")
            .delete()
            .eq("id", s.id);
        } else {
          console.error("web push failed:", code, (e as Error)?.message);
        }
      }
    }),
  );
}

const METODO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  otro: "Otro",
};

type SaleRow = {
  total_cents: number;
  payment_method: string | null;
  customer_name: string | null;
  sold_by: string | null;
  sale_items: { qty: number; products: { name: string } | null }[];
};

// Build and send the "new sale / fiado" notification from a sale id. Runs after
// the response (via next/server `after`), so it never blocks or breaks the sale.
export async function notifyNuevaVenta(
  saleId: string,
  tipo: "venta" | "fiado",
): Promise<void> {
  try {
    const { data } = await insforgeAdmin.database
      .from("sales")
      .select(
        "total_cents, payment_method, customer_name, sold_by, sale_items(qty, products(name))",
      )
      .eq("id", saleId)
      .maybeSingle();
    const s = data as unknown as SaleRow | null;
    if (!s) return;

    let vendedor = "";
    if (s.sold_by) {
      const { data: p } = await insforgeAdmin.database
        .from("profiles")
        .select("full_name")
        .eq("id", s.sold_by)
        .maybeSingle();
      vendedor = (p as { full_name?: string } | null)?.full_name ?? "";
    }

    const productos = (s.sale_items ?? [])
      .map((it) => `${it.qty > 1 ? `${it.qty}× ` : ""}${it.products?.name ?? "—"}`)
      .join(", ");
    const total = formatMXN(s.total_cents);
    const title =
      tipo === "fiado" ? `Nuevo fiado · ${total}` : `Nueva venta · ${total}`;

    const lines = [productos];
    if (tipo === "venta" && s.payment_method)
      lines.push(METODO_LABEL[s.payment_method] ?? s.payment_method);
    if (s.customer_name && s.customer_name !== "Mostrador")
      lines.push(`Cliente: ${s.customer_name}`);
    if (vendedor) lines.push(`Vendió: ${vendedor}`);

    await notifyAdmins({
      title,
      body: lines.filter(Boolean).join("\n"),
      url: tipo === "fiado" ? "/fiados" : "/ventas",
      tag: saleId,
    });
  } catch (e) {
    console.error("notifyNuevaVenta failed:", e);
  }
}
