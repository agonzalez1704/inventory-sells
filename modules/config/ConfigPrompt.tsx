"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

const KEY = "fiable-config-prompt-dismissed";

// Shown once per session to admins when the business info is empty — the
// WhatsApp agent needs it to answer shipping/payment questions.
export function ConfigPrompt() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(KEY) !== "1") setOpen(true);
  }, []);

  function dismiss() {
    sessionStorage.setItem(KEY, "1");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <Modal open onClose={dismiss} title="Configura tu negocio" className="max-w-md">
      <div className="space-y-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Settings className="h-6 w-6" />
        </span>
        <p className="text-sm text-muted-foreground">
          Falta la <strong>información de tu negocio</strong> (envíos, pagos,
          transferencia, ubicación, horario). El asistente de WhatsApp la necesita
          para responder a tus clientes.
        </p>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={dismiss}>
            Más tarde
          </Button>
          <Link
            href="/configuracion"
            onClick={dismiss}
            className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ir a configuración
          </Link>
        </div>
      </div>
    </Modal>
  );
}
