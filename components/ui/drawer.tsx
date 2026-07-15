"use client";

import * as React from "react";
import { Drawer as Vaul } from "vaul";
import { cn } from "@/lib/utils";

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
  return (
    <Vaul.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Vaul.Portal>
        <Vaul.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm" />
        <Vaul.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[94vh] flex-col rounded-t-2xl border-t border-border bg-background outline-none",
            className,
          )}
        >
          <div
            aria-hidden
            className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted"
          />
          <Vaul.Title className="px-5 pb-2 pt-3 text-sm font-semibold">
            {title}
          </Vaul.Title>
          <div
            className="overflow-y-auto px-5 pb-6"
            style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
          >
            {children}
          </div>
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  );
}
