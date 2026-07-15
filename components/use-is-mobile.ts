"use client";

import { useEffect, useState } from "react";

// True below the Tailwind `lg` breakpoint (1024px). Used to switch a Modal for
// a bottom Drawer on phones.
export function useIsMobile(breakpoint = 1024): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return mobile;
}
