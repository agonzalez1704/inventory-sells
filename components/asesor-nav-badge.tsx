"use client";

import { useEffect, useState } from "react";

// Polls the pending-handoff count and renders a small red count chip on the
// Asesor nav link. Hidden when zero.
export function AsesorNavBadge() {
  const [n, setN] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/asesor/pendientes", { cache: "no-store" });
        const j = await r.json();
        if (alive) setN(j.count ?? 0);
      } catch {
        /* ignore transient errors */
      }
    };
    load();
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, 10_000);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("focus", load);
    };
  }, []);

  if (!n) return null;
  return (
    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
      {n}
    </span>
  );
}
