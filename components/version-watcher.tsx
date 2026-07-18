"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

// A deploy invalidates the Server Action ids the loaded page holds, so an open
// tab starts failing on save/cobrar with no clue why. This polls the build sha
// and raises a persistent toast telling the user to reload — deliberately
// non-blocking, because reloading mid-sale would lose the cart.
//
// The real fix is Vercel Skew Protection (routes old clients to their own
// deployment); this is the visible seatbelt.

const INTERVALO_MS = 60_000;
// Fixed id so sonner dedupes: repeated polls (or a focus + interval firing at
// once) can't stack multiple copies of the same warning.
const TOAST_ID = "nueva-version";

export function VersionWatcher() {
  // Once we've warned, stop — re-nagging every 60s would be worse than the bug.
  const avisado = useRef(false);

  useEffect(() => {
    const mio = process.env.NEXT_PUBLIC_BUILD_SHA;
    // No sha locally (or env not exposed) -> nothing to compare; stay quiet.
    if (!mio || mio === "local") return;

    let cancelado = false;

    const avisar = () => {
      if (avisado.current) return;
      avisado.current = true;
      toast.info("Nueva versión de la app disponible", {
        id: TOAST_ID,
        description: "Recarga para evitar errores al guardar.",
        position: "bottom-center",
        duration: Infinity, // a stale tab stays broken until reload — never auto-dismiss
        dismissible: false, // reloading is the only way out; no swipe/close
        action: {
          label: "Recargar",
          onClick: () => window.location.reload(),
        },
      });
    };

    const revisar = async () => {
      if (avisado.current) return;
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { sha?: string };
        if (!cancelado && j.sha && j.sha !== "local" && j.sha !== mio) avisar();
      } catch {
        // Offline / blip — never nag on a failed check.
      }
    };

    const t = setInterval(revisar, INTERVALO_MS);
    // A phone tab sits backgrounded for hours and the interval is throttled
    // there, so re-check the moment it comes back. No visibilityState guard on
    // "visible": coming back IS the event we care about, and gating on it once
    // silently dropped exactly that check.
    const onVisible = () => {
      if (document.visibilityState !== "hidden") revisar();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", revisar);
    revisar();

    return () => {
      cancelado = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", revisar);
    };
  }, []);

  return null;
}
