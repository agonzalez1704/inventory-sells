"use client";

import { useCallback, useSyncExternalStore } from "react";

// True below the Tailwind `lg` breakpoint (1024px). Used to switch a Modal for
// a bottom Drawer on phones.
//
// useSyncExternalStore, not useState+useEffect: the effect version returns false
// on the first client render and corrects itself a frame later, so a phone
// opening a Modal flashed the desktop dialog before it became a drawer. This
// reads matchMedia during the first client render instead. The server can't know
// the viewport, so it reports false there and React re-renders after hydration —
// harmless, since dialogs open on interaction, never during SSR.
export function useIsMobile(breakpoint = 1024): boolean {
  const query = `(max-width: ${breakpoint - 1}px)`;

  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false, // server: no viewport to measure
  );
}
