"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Usb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { impresoraUsbLista, vincularImpresoraUSB, webUsbDisponible } from "@/lib/escpos-usb";

/**
 * Pair this computer with the counter's printer, once.
 *
 * After it, every ticket prints with no dialog at all — the browser remembers
 * the grant across reloads. Renders nothing where it cannot help: a phone, a
 * browser without WebUSB, or a computer that is already paired.
 */
export function VincularImpresora({ className }: { className?: string }) {
  const [mostrar, setMostrar] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!webUsbDisponible()) return;
    impresoraUsbLista()
      .then((lista) => setMostrar(!lista))
      .catch(() => undefined);
  }, []);

  if (!mostrar) return null;

  return (
    <Button
      variant="secondary"
      className={className}
      loading={pending}
      onClick={async () => {
        setPending(true);
        try {
          await vincularImpresoraUSB();
          setMostrar(false);
          toast.success("Impresora vinculada. Los tickets salen solos, sin diálogos.");
        } catch (e) {
          toast.error(
            e instanceof Error && e.message
              ? e.message
              : "No se pudo vincular. Usa el acceso directo de Chrome con impresión directa.",
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <Usb className="h-4 w-4" />
      Vincular impresora
    </Button>
  );
}
