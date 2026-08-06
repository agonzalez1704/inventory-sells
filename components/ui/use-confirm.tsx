"use client";

import * as React from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Opciones = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
};

/**
 * `window.confirm`, replaced by the app's own dialog — and awaitable, so a call
 * site changes from
 *
 *     if (!confirm("¿Borrar?")) return;
 *     if (!(await confirmar({ title: "¿Borrar?" }))) return;
 *
 * rather than growing a piece of state and a block of JSX each. There were a
 * dozen of these; converting them individually would have meant a dozen chances
 * to wire one up wrong.
 *
 * Returns the asker and the element to render once, anywhere in the component.
 */
export function useConfirm(): [
  (o: Opciones) => Promise<boolean>,
  React.ReactNode,
] {
  const [opts, setOpts] = React.useState<Opciones | null>(null);
  // The resolver lives in a ref: it belongs to one particular question, and
  // keeping it in state would let a re-render hand back a stale one.
  const resolver = React.useRef<((v: boolean) => void) | null>(null);

  const responder = React.useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  }, []);

  const confirmar = React.useCallback((o: Opciones) => {
    // A second question while one is open would strand the first promise
    // forever; answer it `false` — nobody agreed to it.
    resolver.current?.(false);
    setOpts(o);
    return new Promise<boolean>((res) => {
      resolver.current = res;
    });
  }, []);

  const dialogo = (
    <ConfirmDialog
      open={opts !== null}
      onClose={() => responder(false)}
      onConfirm={() => responder(true)}
      title={opts?.title ?? ""}
      description={opts?.description}
      confirmLabel={opts?.confirmLabel}
      cancelLabel={opts?.cancelLabel}
      tone={opts?.tone}
    />
  );

  return [confirmar, dialogo];
}
