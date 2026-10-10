"use client";

import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

// shadcn's Base UI combobox (ui.shadcn.com/docs/components/combobox, base-nova),
// translated like drawer.tsx: this repo's color tokens (no popover/neutral
// accent tokens here — `accent` is the money green), lucide icons, and the
// input group inlined instead of pulling shadcn's input-group. ComboboxInput
// renders its children BEFORE the input, as a leading label.

const Combobox = ComboboxPrimitive.Root;

function ComboboxTrigger({ className, ...props }: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn(
        "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:cursor-not-allowed disabled:hover:bg-transparent",
        className,
      )}
      {...props}
    >
      <ChevronDown className="pointer-events-none size-4" />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      className={cn(
        "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground hover:bg-muted",
        className,
      )}
      {...props}
    >
      <X className="pointer-events-none size-4" />
    </ComboboxPrimitive.Clear>
  );
}

function ComboboxInput({
  className,
  inputClassName,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  ...props
}: ComboboxPrimitive.Input.Props & {
  inputClassName?: string;
  showTrigger?: boolean;
  showClear?: boolean;
}) {
  return (
    <ComboboxPrimitive.InputGroup
      data-slot="combobox-input-group"
      className={cn(
        "flex h-11 items-center gap-2 rounded-xl border border-border bg-background pr-1 pl-3 transition-colors focus-within:border-ring",
        disabled && "opacity-50",
        className,
      )}
    >
      {children}
      <ComboboxPrimitive.Input
        data-slot="combobox-input"
        disabled={disabled}
        // 16px on phones: anything smaller makes iOS zoom the page on focus.
        className={cn(
          "h-full min-w-0 flex-1 bg-transparent text-base outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed lg:text-sm",
          inputClassName,
        )}
        {...props}
      />
      {showClear && <ComboboxClear disabled={disabled} />}
      {showTrigger && <ComboboxTrigger disabled={disabled} />}
    </ComboboxPrimitive.InputGroup>
  );
}

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<ComboboxPrimitive.Positioner.Props, "side" | "align" | "sideOffset" | "alignOffset" | "anchor">) {
  return (
    <ComboboxPrimitive.Portal>
      {/* z-[60]: above the drawers and modals (z-50) it usually opens from. */}
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        collisionPadding={12}
        className="isolate z-[60]"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            "group/combobox-content relative max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) animate-fade-in overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-pop",
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "max-h-[min(20rem,var(--available-height))] scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex h-11 w-full cursor-pointer items-center gap-2 rounded-lg pr-9 pl-3 text-base outline-hidden select-none data-highlighted:bg-muted data-disabled:pointer-events-none data-disabled:opacity-50 lg:h-10 lg:text-sm",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        render={<span className="pointer-events-none absolute right-3 flex size-4 items-center justify-center" />}
      >
        <Check className="size-4" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "hidden w-full justify-center py-6 text-center text-sm text-muted-foreground group-data-empty/combobox-content:flex",
        className,
      )}
      {...props}
    />
  );
}

export {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxTrigger,
  ComboboxClear,
};
