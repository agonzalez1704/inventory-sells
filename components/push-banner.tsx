"use client";

import { useState } from "react";
import { Bell, X, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePush } from "@/components/use-push";

// Shown to admins who haven't enabled push on this device — activate right here.
export function PushBanner() {
  const { supported, enabled, busy, ready, iosNeedsInstall, enable } = usePush();
  const [dismissed, setDismissed] = useState(false);

  if (!ready || !supported || enabled || dismissed) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-brand/30 bg-brand-soft/40 p-3 sm:items-center">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
        <Bell className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Activa las notificaciones</p>
        <p className="text-xs text-muted-foreground">
          {iosNeedsInstall ? (
            <>
              En Safari toca <Share className="inline h-3.5 w-3.5" /> Compartir →
              “Agregar a inicio”, abre la app desde el ícono y actívalas ahí.
            </>
          ) : (
            "Recibe un aviso en este teléfono por cada venta y fiado."
          )}
        </p>
      </div>
      {!iosNeedsInstall && (
        <Button size="sm" onClick={enable} loading={busy} className="shrink-0">
          <Bell className="h-4 w-4" />
          Activar
        </Button>
      )}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Descartar"
        className="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
