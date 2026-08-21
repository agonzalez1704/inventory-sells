"use client";

import * as React from "react";
import { Drawer as Vaul } from "vaul";
import { cn } from "@/lib/utils";

/**
 * How much room is left above the software keyboard, and how tall it is.
 *
 * iOS does not shrink the layout viewport when the keyboard opens — it covers
 * it. So `bottom: 0` is behind the keyboard, and any height in vh or dvh still
 * measures the whole screen. visualViewport is the only thing that reports what
 * is actually visible.
 *
 * Returns nulls until measured, so the server render and the first paint use
 * the CSS fallback instead of guessing a number that would flash.
 */
function useAreaVisible(activo: boolean) {
  const [v, setV] = React.useState<{ alto: number; teclado: number } | null>(null);

  React.useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!activo || !vv) return;

    const medir = () => {
      // What the keyboard covers: everything the layout viewport has that the
      // visual one does not, minus whatever it has been scrolled by.
      const teclado = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setV({ alto: vv.height, teclado });
    };

    medir();
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => {
      vv.removeEventListener("resize", medir);
      vv.removeEventListener("scroll", medir);
    };
  }, [activo]);

  return v;
}

// What the sheet gives back at the top: the grab handle's own box, mt-2.5 (10px)
// plus h-1.5 (6px). The sheet is otherwise as tall as the visible area, so this
// sliver of overlay is the only thing saying it is a sheet and not a page — and
// it is where a thumb reaches to drag it shut.
const RESPIRO_HANDLE = 16;

// Bottom drawer (vaul / shadcn-style) — the mobile counterpart to Modal.
export function Drawer({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const area = useAreaVisible(open);

  return (
    <Vaul.Root
      open={open}
      onOpenChange={(o) => !o && onClose()}
      /*
        vaul's own keyboard handling is what broke this sheet.
        On focus it sets an inline height on the drawer, and for a SHORT one —
        anything under 80% of the screen, which every form in this app is — it
        uses `visualViewportHeight - 26`. A three-field expense form was being
        stretched to fill the entire visible viewport: title and buttons thrown
        to the top, a blank expanse in the middle, the inputs behind the
        keyboard.
        The geometry below does the same job without the height heuristic, so
        the sheet stays the size of its content.

        This flag also gates vaul's own iOS scroll lock, which sounds like a
        bad trade — it is not. Radix's Dialog sits underneath and brings
        RemoveScroll, so the page behind stays put either way.
      */
      repositionInputs={false}
      // Dismissal belongs to the handle, the backdrop and the X — not to any
      // downward drag on the content. The reported chain: iOS auto-zooms on a
      // small input, the pinch to undo the zoom puts one finger travelling
      // down, vaul reads it as a dismiss drag, and a half-filled form is gone.
      // Forms are exactly where accidental dismissal costs the most.
      handleOnly
    >
      <Vaul.Portal>
        <Vaul.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm" />
        <Vaul.Content
          className={cn(
            // dvh, not vh: on iOS `vh` measures the viewport as if the browser
            // chrome weren't there, so a 94vh sheet is taller than the screen
            // actually is and its top starts off-screen. Only the fallback —
            // once visualViewport reports, the inline values win.
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[calc(100dvh-16px)] flex-col rounded-t-2xl border-t border-border bg-background outline-none",
            className,
          )}
          style={
            area
              ? {
                  // Sit on top of the keyboard rather than behind it, and never
                  // be taller than what is left above it.
                  bottom: area.teclado,
                  maxHeight: area.alto - RESPIRO_HANDLE,
                }
              : undefined
          }
        >
          {/* Vaul's own Handle, not a decorative div: with handleOnly, this
              is the one place a drag can dismiss from. Larger hit area than
              the visible pill, which is what a thumb actually needs. */}
          <Vaul.Handle className="!mx-auto !mt-2.5 !h-1.5 !w-10 shrink-0 !rounded-full !bg-muted" />
          <Vaul.Title className="shrink-0 px-5 pb-2 pt-3 text-sm font-semibold">
            {title}
          </Vaul.Title>
          {/*
            min-h-0 is what makes the sheet size to its content. A flex child
            defaults to min-height:auto, so this scroller refuses to shrink below
            its content and pushes the sheet to its full max height — leaving a
            blank expanse under a short form, and putting the buttons off-screen
            once the keyboard opens.
          */}
          <div
            className="min-h-0 flex-1 overflow-y-auto px-5 pb-6"
            style={{
              // The home indicator only needs clearing when nothing else is
              // down there; with the keyboard up, that space is the keyboard's.
              paddingBottom: area?.teclado
                ? "1.5rem"
                : "max(1.5rem, env(safe-area-inset-bottom))",
            }}
          >
            {children}
          </div>
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  );
}
