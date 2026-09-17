import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge ships v4's default scale, and this app runs Tailwind 3 with
 * its own tokens — so without this the library did not know `shadow-card`,
 * `shadow-pop` or `animate-fade-in` were shadows and animations at all:
 * `cn("shadow-sm", "shadow-card")` kept BOTH and let CSS order decide, which
 * means a className passed to a component silently failed to override it.
 *
 * Declaring the custom values puts them in the right conflict group. Drop this
 * extension when the app moves to Tailwind 4 and the names line up again.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      shadow: [{ shadow: ["xs", "card", "pop"] }],
      animate: [{ animate: ["fade-in"] }],
    },
  },
});

// Merge conditional Tailwind classes, de-duplicating conflicts.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
