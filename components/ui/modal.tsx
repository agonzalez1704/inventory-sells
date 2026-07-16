"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Drawer } from "@/components/ui/drawer";
import { useIsMobile } from "@/components/use-is-mobile";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /**
   * Desktop panel classes — width, in practice (`max-w-lg`, `max-w-2xl`).
   * Deliberately NOT forwarded to the drawer: the drawer is `inset-x-0`, so a
   * `max-w-md` there would pin it to 448px against the left edge instead of
   * spanning the screen. Width is a desktop concern; a bottom sheet is always
   * full-width.
   */
  className?: string;
  /** Rare drawer-only override (e.g. a taller sheet). */
  drawerClassName?: string;
};

/**
 * Dialog that picks its own form factor: a bottom Drawer on phones, a centered
 * modal on desktop. Both halves take the same props, so callers just render
 * <Modal> and never think about it.
 */
export function Modal({ drawerClassName, ...props }: ModalProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    const { open, onClose, title, children } = props;
    return (
      <Drawer open={open} onClose={onClose} title={title} className={drawerClassName}>
        {children}
      </Drawer>
    );
  }
  return <DesktopModal {...props} />;
}

function DesktopModal({
  open,
  onClose,
  title,
  children,
  className,
}: Omit<ModalProps, "drawerClassName">) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          "relative mt-2 w-full max-w-3xl animate-fade-in rounded-2xl border border-border bg-background shadow-pop",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="cursor-pointer rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
