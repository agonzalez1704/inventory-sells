"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

/**
 * In-app confirmation, replacing window.confirm.
 *
 * The native dialog can't be styled, says "fiable.vercel.app says", strands the
 * user in a browser chrome popup, and — the part that matters — can only ever
 * offer yes or no. A decision like receiving a shipment that doesn't match its
 * invoice usually has a third answer worth taking, so `extra` allows one.
 *
 * Built on Modal, so it inherits the bottom-sheet form factor on phones.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "default",
  loading = false,
  extra,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` for anything that destroys or is hard to walk back. */
  tone?: "default" | "danger";
  loading?: boolean;
  /** A third option — e.g. "fix it first" — rendered beside cancel. */
  extra?: React.ReactNode;
  /** Detail worth showing before deciding: what changes, what's missing. */
  children?: React.ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-md">
      <div className="space-y-4">
        {description && (
          <div className="flex items-start gap-2.5">
            {tone === "danger" && (
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
              </span>
            )}
            <div className="text-sm text-muted-foreground">{description}</div>
          </div>
        )}

        {children}

        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          {extra}
          <Button
            onClick={onConfirm}
            loading={loading}
            className={cn(
              tone === "danger" &&
                "bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600",
            )}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
