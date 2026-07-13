"use server";

import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { notifyAdmins } from "@/lib/push";

export type WebPushSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

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

// Send a test push to the admin's devices to confirm delivery.
export async function sendTestPush(): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin") throw new Error("Solo administradores");

  await notifyAdmins({
    title: "Prueba · Fiable",
    body: "Si ves esto, las notificaciones funcionan ✓",
    url: "/ventas",
  });
}
