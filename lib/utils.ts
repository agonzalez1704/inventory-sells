import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * This app's own shadows (`shadow-card`, `shadow-pop`) and animation
 * (`animate-fade-in`) are not in tailwind-merge's scale, so without declaring
 * them `cn("shadow-sm", "shadow-card")` kept BOTH classes and let CSS order
 * decide — a className passed to a component silently failed to override it.
 * The scale itself now matches: the app is on Tailwind 4, like tailwind-merge.
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
