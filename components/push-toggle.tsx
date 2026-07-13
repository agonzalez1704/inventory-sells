"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff, Smartphone, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  subscribeToPush,
  unsubscribeFromPush,
  sendTestPush,
} from "@/modules/notifications/actions";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function PushToggle() {
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [iosNeedsInstall, setIosNeedsInstall] = useState(false);

  useEffect(() => {
    const ok =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;
    setSupported(ok);

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isIOS && !standalone) setIosNeedsInstall(true);

    if (!ok) {
      setReady(true);
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        setEnabled(!!sub);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error("Permiso de notificaciones denegado");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Falta la llave VAPID pública");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth)
        throw new Error("Suscripción inválida");
      await subscribeToPush(
        {
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        },
        navigator.userAgent,
      );
      setEnabled(true);
      toast.success("Notificaciones activadas en este teléfono");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo activar");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribeFromPush(sub.endpoint);
        await sub.unsubscribe();
      }
      setEnabled(false);
      toast.success("Notificaciones desactivadas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function probar() {
    setBusy(true);
    try {
      await sendTestPush();
      toast.success("Prueba enviada — revisa tu teléfono");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  if (!supported) {
    return (
      <p className="text-sm text-muted-foreground">
        Este navegador no soporta notificaciones push.
      </p>
    );
  }

  if (iosNeedsInstall && !enabled) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-800">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium">Primero agrega la app a tu inicio (iPhone)</p>
          <p className="mt-0.5 text-amber-700">
            En Safari toca{" "}
            <Share className="inline h-3.5 w-3.5" /> Compartir → “Agregar a inicio”,
            abre la app desde el ícono y regresa aquí para activar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {enabled ? (
        <>
          <Button variant="secondary" onClick={disable} loading={busy}>
            <BellOff className="h-4 w-4" />
            Desactivar en este teléfono
          </Button>
          <Button variant="ghost" onClick={probar} disabled={busy}>
            Enviar prueba
          </Button>
        </>
      ) : (
        <Button onClick={enable} loading={busy}>
          <Bell className="h-4 w-4" />
          Activar notificaciones en este teléfono
        </Button>
      )}
    </div>
  );
}
