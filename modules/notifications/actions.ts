"use server";

import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { pushToUsers, DEFAULT_PREFS, type NotifKind } from "@/lib/push";

export type WebPushSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type NotifPrefs = Record<NotifKind, boolean>;

// Store this device's push subscription. Admin-only: notifications are for
// admins, so only they can subscribe.
export async function subscribeToPush(
  sub: WebPushSub,
  userAgent: string | null,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin")
    throw new Error("Solo administradores reciben notificaciones");
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth)
    throw new Error("Suscripción inválida");

  const insforge = await createInsForgeServerClient();
  // Replace any prior row for this endpoint (re-subscribe on the same device).
  await insforge.database
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", sub.endpoint);
  const { error } = await insforge.database.from("push_subscriptions").insert([
    {
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: userAgent?.slice(0, 300) ?? null,
    },
  ]);
  if (error) throw new Error(error.message ?? "No se pudo suscribir");
}

export async function unsubscribeFromPush(endpoint: string): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  if (error) throw new Error(error.message ?? "No se pudo cancelar");
}

// Send a test push to THIS admin's own devices to confirm delivery.
export async function sendTestPush(): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin") throw new Error("Solo administradores");

  await pushToUsers([userId], {
    title: "Prueba · Fiable",
    body: "Si ves esto, las notificaciones funcionan ✓",
    url: "/ventas",
  });
}

// Which events notify this admin (resolved with defaults).
export async function getNotifPrefs(): Promise<NotifPrefs> {
  const { userId } = await auth();
  if (!userId) return { ...DEFAULT_PREFS };

  const insforge = await createInsForgeServerClient();
  const { data } = await insforge.database
    .from("notification_prefs")
    .select("venta, fiado, abono, cancelacion")
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as NotifPrefs | null;
  return row ? { ...DEFAULT_PREFS, ...row } : { ...DEFAULT_PREFS };
}

export async function saveNotifPrefs(prefs: NotifPrefs): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin") throw new Error("Solo administradores");

  const insforge = await createInsForgeServerClient();
  const row = {
    venta: !!prefs.venta,
    fiado: !!prefs.fiado,
    abono: !!prefs.abono,
    cancelacion: !!prefs.cancelacion,
  };
  await insforge.database
    .from("notification_prefs")
    .delete()
    .eq("user_id", userId);
  const { error } = await insforge.database
    .from("notification_prefs")
    .insert([row]);
  if (error) throw new Error(error.message ?? "No se pudieron guardar");
}
