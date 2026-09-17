"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { cn } from "@/lib/utils";

// shadcn's Base UI drawer (ui.shadcn.com/docs/components/drawer), translated
// to this repo's Tailwind 3 (arbitrary data-[…] variants instead of v4's
// data-starting-style:, var() instead of (--x)) and its color tokens.
// Slides in and out, swipes to dismiss, and stacks nested drawers.

type Direccion = NonNullable<DrawerPrimitive.Root.Props["swipeDirection"]>;

const DrawerContext = React.createContext<{ swipeDirection: Direccion; showSwipeHandle: boolean }>({
  swipeDirection: "down",
  showSwipeHandle: false,
});

function Drawer({
  swipeDirection = "down",
  showSwipeHandle = false,
  ...props
}: DrawerPrimitive.Root.Props & { showSwipeHandle?: boolean }) {
  const ctx = React.useMemo(() => ({ swipeDirection, showSwipeHandle }), [swipeDirection, showSwipeHandle]);
  return (
    <DrawerContext.Provider value={ctx}>
      <DrawerPrimitive.Root data-slot="drawer" swipeDirection={swipeDirection} {...props} />
    </DrawerContext.Provider>
  );
}

const DrawerTrigger = DrawerPrimitive.Trigger;
const DrawerClose = DrawerPrimitive.Close;
const DrawerPortal = DrawerPrimitive.Portal;

function DrawerOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 min-h-dvh select-none bg-slate-950/45 opacity-[calc(1-var(--drawer-swipe-progress,0))] transition-opacity duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)]",
        "data-[ending-style]:pointer-events-none data-[ending-style]:opacity-0 data-[ending-style]:duration-[calc(var(--drawer-swipe-strength,1)*400ms)] data-[starting-style]:opacity-0 data-[swiping]:duration-0",
        // iOS Safari: fixed backdrops stop short once the page has scrolled.
        "supports-[-webkit-touch-callout:none]:absolute",
        className,
      )}
      {...props}
    />
  );
}

function DrawerSwipeHandle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-swipe-handle"
      aria-hidden="true"
      className={cn(
        "flex h-5 w-full shrink-0 cursor-grab items-end justify-center active:cursor-grabbing",
        "after:block after:h-1.5 after:w-10 after:rounded-full after:bg-muted-foreground/30 after:content-['']",
        className,
      )}
      {...props}
    />
  );
}

const POPUP = [
  "group/drawer-popup pointer-events-auto fixed z-50 flex min-h-0 flex-col bg-background text-foreground shadow-2xl outline-none",
  "[transform:translate3d(var(--translate-x,0px),var(--translate-y,0px),0)_scale(var(--stack-scale,1))] transition-[transform,height,opacity,filter] duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
  // Nested drawers: the ones behind shrink and peek out.
  "[--peek:1rem] [--stack-step:0.05] [--stack-progress:clamp(0,var(--drawer-swipe-progress,0),1)] [--stack-peek-offset:max(0px,calc((var(--nested-drawers,0)-var(--stack-progress))*var(--peek)))] [--stack-scale-base:max(0,calc(1-(var(--nested-drawers,0)*var(--stack-step))))] [--stack-scale:clamp(0,calc(var(--stack-scale-base)+(var(--stack-step)*var(--stack-progress))),1)] [--stack-shrink:calc(1-var(--stack-scale))]",
  "data-[nested-drawer-open]:brightness-95",
  // Enter / exit / swipe.
  "data-[starting-style]:[transform:var(--closed-transform)] data-[ending-style]:[transform:var(--closed-transform)] data-[ending-style]:opacity-[0.9999] data-[ending-style]:duration-[calc(var(--drawer-swipe-strength,1)*400ms)] data-[swiping]:duration-0 data-[nested-drawer-swiping]:duration-0",
  // Overshoot on a swipe shows the drawer's own color, not the page.
  "after:pointer-events-none after:absolute after:bg-background after:content-['']",
  // Down: bottom sheet.
  "data-[swipe-direction=down]:inset-x-0 data-[swipe-direction=down]:bottom-0 data-[swipe-direction=down]:max-h-[calc(100dvh-3rem)] data-[swipe-direction=down]:origin-bottom data-[swipe-direction=down]:rounded-t-2xl data-[swipe-direction=down]:border-t data-[swipe-direction=down]:border-border",
  "data-[swipe-direction=down]:[--closed-transform:translate3d(0,calc(100%+2px),0)] data-[swipe-direction=down]:[--translate-y:calc(var(--drawer-swipe-movement-y,0px)-var(--stack-peek-offset)-(var(--stack-shrink)*var(--drawer-frontmost-height,var(--drawer-height,0px))))]",
  "data-[swipe-direction=down]:after:inset-x-0 data-[swipe-direction=down]:after:top-full data-[swipe-direction=down]:after:h-12",
  // Right: side panel.
  "data-[swipe-direction=right]:inset-y-0 data-[swipe-direction=right]:right-0 data-[swipe-direction=right]:w-[min(24rem,88vw)] data-[swipe-direction=right]:origin-right data-[swipe-direction=right]:border-l data-[swipe-direction=right]:border-border",
  "data-[swipe-direction=right]:[--closed-transform:translate3d(calc(100%+2px),0,0)] data-[swipe-direction=right]:[--translate-x:calc(var(--drawer-swipe-movement-x,0px)-var(--stack-peek-offset)-(var(--stack-shrink)*100%))]",
  "data-[swipe-direction=right]:after:inset-y-0 data-[swipe-direction=right]:after:left-full data-[swipe-direction=right]:after:w-12",
  // Left: navigation.
  "data-[swipe-direction=left]:inset-y-0 data-[swipe-direction=left]:left-0 data-[swipe-direction=left]:w-[min(18rem,85vw)] data-[swipe-direction=left]:origin-left data-[swipe-direction=left]:border-r data-[swipe-direction=left]:border-border",
  "data-[swipe-direction=left]:[--closed-transform:translate3d(calc(-100%-2px),0,0)] data-[swipe-direction=left]:[--translate-x:calc(var(--drawer-swipe-movement-x,0px)+var(--stack-peek-offset)+(var(--stack-shrink)*100%))]",
  "data-[swipe-direction=left]:after:inset-y-0 data-[swipe-direction=left]:after:right-full data-[swipe-direction=left]:after:w-12",
].join(" ");

function DrawerContent({
  className,
  children,
  overlay = true,
  ...props
}: DrawerPrimitive.Popup.Props & {
  /** A nested drawer skips its own overlay: the parent's already dims the page. */
  overlay?: boolean;
}) {
  const { swipeDirection, showSwipeHandle } = React.useContext(DrawerContext);
  return (
    <DrawerPortal>
      {overlay && <DrawerOverlay />}
      <DrawerPrimitive.Viewport data-slot="drawer-viewport" className="pointer-events-none fixed inset-0 z-50 select-none">
        <DrawerPrimitive.Popup
          data-slot="drawer-popup"
          data-swipe-direction={swipeDirection}
          className={cn(POPUP, className)}
          {...props}
        >
          {showSwipeHandle && <DrawerSwipeHandle />}
          <DrawerPrimitive.Content
            data-slot="drawer-content"
            className="flex min-h-0 flex-1 select-text flex-col overflow-hidden rounded-[inherit] transition-opacity duration-300 [[data-swipe-direction=down][data-nested-drawer-open]_&]:opacity-0 group-data-[swiping]/drawer-popup:select-none"
          >
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="drawer-header" className={cn("flex shrink-0 flex-col gap-1 px-5 pt-3", className)} {...props} />;
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex shrink-0 flex-col gap-2 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3", className)}
      {...props}
    />
  );
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return <DrawerPrimitive.Title data-slot="drawer-title" className={cn("text-base font-semibold", className)} {...props} />;
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

/**
 * The app's form sheet (Modal's phone half, filter sheets): a bottom drawer
 * with a title, sized to its content, aware of the software keyboard.
 *
 * Dismissal is the handle, the backdrop or Escape — not a drag on the body:
 * on iOS the pinch that undoes an input's auto-zoom moves a finger down, and a
 * half-filled form closing on that is the costliest accident a sheet can have.
 */
function Hoja({
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
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} showSwipeHandle>
      <DrawerPrimitive.VirtualKeyboardProvider>
        <DrawerContent className={className}>
          <DrawerHeader className="pb-2">
            <DrawerTitle className="text-sm">{title}</DrawerTitle>
          </DrawerHeader>
          <div
            data-base-ui-swipe-ignore
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+var(--drawer-keyboard-inset,0px)))]"
          >
            {children}
          </div>
        </DrawerContent>
      </DrawerPrimitive.VirtualKeyboardProvider>
    </Drawer>
  );
}

export {
  Drawer,
  DrawerTrigger,
  DrawerClose,
  DrawerPortal,
  DrawerOverlay,
  DrawerSwipeHandle,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  Hoja,
};
