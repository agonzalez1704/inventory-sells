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

// Which events can notify, and the default when a user has no saved prefs.
export type NotifKind = "venta" | "fiado" | "abono" | "cancelacion";
export const DEFAULT_PREFS: Record<NotifKind, boolean> = {
  venta: true,
  fiado: true,
  abono: false,
  cancelacion: false,
};

// Low-level: push to specific users' devices. Best-effort; prunes dead subs.
export async function pushToUsers(
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (!configure() || userIds.length === 0) return;
  const { data: subs } = await insforgeAdmin.database
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", userIds);
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

// Admins who opted into this event kind (falling back to DEFAULT_PREFS).
async function adminsForKind(kind: NotifKind): Promise<string[]> {
  const { data: admins } = await insforgeAdmin.database
    .from("profiles")
    .select("id")
    .eq("role", "admin");
  const ids = ((admins ?? []) as { id: string }[]).map((a) => a.id);
  if (!ids.length) return [];

  const { data: prefs } = await insforgeAdmin.database
    .from("notification_prefs")
    .select("user_id, venta, fiado, abono, cancelacion")
    .in("user_id", ids);
  const byUser = new Map(
    ((prefs ?? []) as (Record<NotifKind, boolean> & { user_id: string })[]).map(
      (p) => [p.user_id, p],
    ),
  );
  return ids.filter((id) => {
    const p = byUser.get(id);
    return p ? p[kind] : DEFAULT_PREFS[kind];
  });
}

export async function notifyAdmins(
  kind: NotifKind,
  payload: PushPayload,
): Promise<void> {
  const users = await adminsForKind(kind);
  await pushToUsers(users, payload);
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
  note: string | null;
  sold_by: string | null;
  sale_items: { qty: number; products: { name: string } | null }[];
};

async function fetchSale(saleId: string): Promise<SaleRow | null> {
  const { data } = await insforgeAdmin.database
    .from("sales")
    .select(
      "total_cents, payment_method, customer_name, note, sold_by, sale_items(qty, products(name))",
    )
    .eq("id", saleId)
    .maybeSingle();
  return (data as unknown as SaleRow | null) ?? null;
}

function productos(s: SaleRow): string {
  return (s.sale_items ?? [])
    .map((it) => `${it.qty > 1 ? `${it.qty}× ` : ""}${it.products?.name ?? "—"}`)
    .join(", ");
}

function quien(s: SaleRow): string | null {
  const c = s.customer_name && s.customer_name !== "Mostrador" ? s.customer_name : null;
  return c ?? s.note ?? null;
}

async function sellerName(soldBy: string | null): Promise<string> {
  if (!soldBy) return "";
  const { data } = await insforgeAdmin.database
    .from("profiles")
    .select("full_name")
    .eq("id", soldBy)
    .maybeSingle();
  return (data as { full_name?: string } | null)?.full_name ?? "";
}

// New sale / fiado.
export async function notifyNuevaVenta(
  saleId: string,
  tipo: "venta" | "fiado",
): Promise<void> {
  try {
    const s = await fetchSale(saleId);
    if (!s) return;
    const vendedor = await sellerName(s.sold_by);
    const total = formatMXN(s.total_cents);
    const lines = [productos(s)];
    if (tipo === "venta" && s.payment_method)
      lines.push(METODO_LABEL[s.payment_method] ?? s.payment_method);
    const q = quien(s);
    if (q) lines.push(`Cliente: ${q}`);
    if (vendedor) lines.push(`Vendió: ${vendedor}`);
    await notifyAdmins(tipo, {
      title: tipo === "fiado" ? `Nuevo fiado · ${total}` : `Nueva venta · ${total}`,
      body: lines.filter(Boolean).join("\n"),
      url: tipo === "fiado" ? "/fiados" : "/ventas",
      tag: saleId,
    });
  } catch (e) {
    console.error("notifyNuevaVenta failed:", e);
  }
}

// Payment toward a fiado — reads the latest sale_pago, so it works for both a
// partial abono and a full collection (settle_loan also writes a sale_pago).
export async function notifyAbono(saleId: string): Promise<void> {
  try {
    const { data: pago } = await insforgeAdmin.database
      .from("sale_pagos")
      .select("monto_cents, metodo")
      .eq("sale_id", saleId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const p = pago as { monto_cents: number; metodo: string } | null;
    if (!p) return;

    const s = await fetchSale(saleId);
    const lines = [METODO_LABEL[p.metodo] ?? p.metodo];
    if (s) {
      const q = quien(s);
      if (q) lines.push(`Cliente: ${q}`);
      const prods = productos(s);
      if (prods) lines.push(prods);
    }
    await notifyAdmins("abono", {
      title: `Abono a fiado · ${formatMXN(p.monto_cents)}`,
      body: lines.filter(Boolean).join("\n"),
      url: "/fiados",
      tag: `abono-${saleId}`,
    });
  } catch (e) {
    console.error("notifyAbono failed:", e);
  }
}

// Voided sale or cancelled fiado.
export async function notifyCancelacion(
  saleId: string,
  tipo: "venta" | "fiado",
): Promise<void> {
  try {
    const s = await fetchSale(saleId);
    if (!s) return;
    const lines = [productos(s)];
    const q = quien(s);
    if (q) lines.push(`Cliente: ${q}`);
    await notifyAdmins("cancelacion", {
      title:
        tipo === "fiado"
          ? `Fiado cancelado · ${formatMXN(s.total_cents)}`
          : `Venta anulada · ${formatMXN(s.total_cents)}`,
      body: lines.filter(Boolean).join("\n"),
      url: tipo === "fiado" ? "/fiados" : "/ventas",
      tag: `void-${saleId}`,
    });
  } catch (e) {
    console.error("notifyCancelacion failed:", e);
  }
}
