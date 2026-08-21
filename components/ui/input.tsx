"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/components/use-is-mobile";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, autoFocus, ...props }, ref) => {
  // autoFocus is a desktop convenience and a mobile defect. On a phone it opens
  // the software keyboard the instant the field mounts — which, inside a bottom
  // sheet, happens before the sheet has finished animating in, and the keyboard
  // then covers the form it just opened. iOS compounds it: to reveal the focused
  // field it scrolls the sheet's container, pushing a fixed-position sheet's own
  // buttons off the top of the screen.
  //
  // Handled here rather than at each call site because there were a dozen of
  // them and every new one would have to remember.
  //
  // useIsMobile reports false during SSR, so this would emit `autofocus` in the
  // server HTML and the browser would act on it before hydration could take it
  // back. It doesn't, because every autoFocus in this app is inside a dialog,
  // and dialogs render nothing until someone opens them — client-side, after
  // hydration. A page-level autoFocus outside a dialog would need its own guard.
  const enPhone = useIsMobile();
  return (
    <input
      ref={ref}
      autoFocus={autoFocus && !enPhone}
      className={cn(
        "h-10 w-full rounded-lg border border-border bg-background px-3 text-base sm:text-sm text-foreground transition-colors placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/10 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});
Input.displayName = "Input";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-10 w-full cursor-pointer rounded-lg border border-border bg-background px-3 text-base sm:text-sm text-foreground transition-colors focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/10 disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";
