"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// shadcn's Base UI select (ui.shadcn.com/docs/components/select, base-nova),
// translated like combobox.tsx: this repo's tokens, lucide icons, 44px rows on
// phones. Pass `items` ({ value: label }) to Select so the trigger shows the
// label, not the raw value.

const Select = SelectPrimitive.Root;

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return <SelectPrimitive.Value data-slot="select-value" className={cn("min-w-0 flex-1 truncate text-left", className)} {...props} />;
}

function SelectTrigger({ className, children, ...props }: SelectPrimitive.Trigger.Props) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-11 w-full min-w-0 cursor-pointer items-center gap-2 rounded-xl border border-border bg-background px-3 text-base transition-colors outline-hidden focus-visible:border-ring data-disabled:cursor-not-allowed data-disabled:opacity-50 data-popup-open:border-ring lg:h-10 lg:text-sm",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon render={<ChevronDown className="pointer-events-none size-4 shrink-0 text-muted-foreground" />} />
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignItemWithTrigger = false,
  ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, "side" | "sideOffset" | "align" | "alignItemWithTrigger">) {
  return (
    <SelectPrimitive.Portal>
      {/* z-[60]: above the drawers and modals (z-50) it usually opens from. */}
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignItemWithTrigger={alignItemWithTrigger}
        collisionPadding={12}
        className="isolate z-[60]"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            "relative max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) animate-fade-in overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-pop",
            className,
          )}
          {...props}
        >
          <SelectPrimitive.List className="max-h-[min(22rem,var(--available-height))] scroll-py-1 overflow-y-auto overscroll-contain p-1">
            {children}
          </SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({
  className,
  children,
  description,
  ...props
}: SelectPrimitive.Item.Props & { description?: React.ReactNode }) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex min-h-11 w-full cursor-pointer flex-col justify-center rounded-lg py-2 pr-9 pl-3 text-base outline-hidden select-none data-highlighted:bg-muted data-disabled:pointer-events-none data-disabled:opacity-50 lg:min-h-10 lg:text-sm",
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      {description && <span className="text-xs text-muted-foreground">{description}</span>}
      <SelectPrimitive.ItemIndicator
        render={<span className="pointer-events-none absolute top-1/2 right-3 flex size-4 -translate-y-1/2 items-center justify-center" />}
      >
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
