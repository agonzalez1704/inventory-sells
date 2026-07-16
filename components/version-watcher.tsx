"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";

// A deploy invalidates the Server Action ids the loaded page holds, so an open
// tab starts failing on save/cobrar with no clue why. This polls the build sha
// and tells the user to reload — deliberately non-blocking, because reloading
// mid-sale would lose the cart.
//
// The real fix is Vercel Skew Protection (routes old clients to their own
// deployment); this is the visible seatbelt.

const INTERVALO_MS = 60_000;

export function VersionWatcher() {
  const [nueva, setNueva] = useState(false);
  const [oculto, setOculto] = useState(false);

  const revisar = useCallback(async () => {
    const mio = process.env.NEXT_PUBLIC_BUILD_SHA;
    // No sha locally (or env not exposed) -> nothing to compare; stay quiet.
    if (!mio || mio === "local") return;
    try {
      const r = await fetch("/api/health", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { sha?: string };
      if (j.sha && j.sha !== "local" && j.sha !== mio) setNueva(true);
    } catch {
      // Offline / blip — never nag on a failed check.
    }
  }, []);

  useEffect(() => {
    if (nueva) return; // already known; stop polling
    const t = setInterval(revisar, INTERVALO_MS);
    // A phone tab sits backgrounded for hours and the interval is throttled
    // there, so re-check the moment it comes back. No visibilityState guard:
    // coming back IS the event we care about, and gating on "visible" silently
    // dropped exactly that check.
    const onVisible = () => {
      if (document.visibilityState !== "hidden") revisar();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", revisar);
    revisar();
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", revisar);
    };
  }, [revisar, nueva]);

  if (!nueva || oculto) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-brand/40 bg-background p-3 shadow-pop">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
          <RefreshCw className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Nueva versión de la app disponible</p>
          <p className="text-xs text-muted-foreground">
            Recarga para evitar errores al guardar.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="shrink-0 cursor-pointer rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:opacity-90"
        >
          Recargar
        </button>
        <button
          onClick={() => setOculto(true)}
          aria-label="Ocultar aviso"
          className="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
