"use client";

import { Bell, BellOff, Smartphone, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePush } from "@/components/use-push";

export function PushToggle() {
  const { supported, enabled, busy, ready, iosNeedsInstall, enable, disable, probar } =
    usePush();

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
            En Safari toca <Share className="inline h-3.5 w-3.5" /> Compartir →
            “Agregar a inicio”, abre la app desde el ícono y regresa aquí para
            activar.
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
