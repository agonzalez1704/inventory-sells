import { cn } from "@/lib/utils";

/**
 * The docked action bar at the bottom of a phone screen.
 *
 * Extracted because the register and the quote builder each had their own copy
 * of the same four tricky declarations, which is how one of them ended up
 * fixed and the other not. Getting a bar to sit at the bottom of a phone is
 * three separate traps, and none of them are obvious from the markup:
 *
 *   * backdrop-filter on a position:fixed element is the one combination iOS
 *     Safari composites at a stale offset after a scroll — the bar gets drawn
 *     partway up the page while the list scrolls past it. At the bottom edge of
 *     the screen a blur buys nothing, so the background is simply opaque.
 *
 *   * translateZ(0) keeps it on its own compositing layer, so the browser
 *     cannot fold it into the scrolling one and carry it along.
 *
 *   * The safe-area inset is ADDED to the padding, not max()'d with it. A
 *     max() returns the raw 34px inset on a phone with a home indicator, about
 *     21px of which is the indicator itself — so the button ends up sitting on
 *     top of it with no gap. Adding leaves a real gap on every device, and a
 *     full 1rem on the ones that report no inset at all.
 *
 * Callers must still reserve the height in the scrolling content (pb-28), or
 * the last row hides behind it.
 */
export function BarraInferior({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-4 pt-3 lg:hidden",
        className,
      )}
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
        transform: "translateZ(0)",
      }}
    >
      {children}
    </div>
  );
}
