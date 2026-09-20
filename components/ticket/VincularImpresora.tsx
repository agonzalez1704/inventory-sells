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
 * the grant across reloads. Hidden only once this computer is paired.
 */
export function VincularImpresora({ className }: { className?: string }) {
  // Shown unless this computer is already paired — including where WebUSB is
  // missing. Hiding it there is what made the button "only appear for the
  // owner": every seller on another browser saw nothing at all and had no way
  // to know why. Now it is there and it says what to do instead.
  const [mostrar, setMostrar] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!webUsbDisponible()) {
      setMostrar(true);
      return;
    }
    impresoraUsbLista()
      .then((lista) => setMostrar(!lista))
      .catch(() => setMostrar(true));
  }, []);

  if (!mostrar) return null;

  return (
    <Button
      variant="secondary"
      className={className}
      loading={pending}
      onClick={async () => {
        if (!webUsbDisponible()) {
          toast.error(
            "Este navegador no puede imprimir sin diálogos. Abre el punto de venta en Chrome o Edge de computadora, o usa el acceso directo de Chrome con impresión directa.",
            { duration: 8000 },
          );
          return;
        }
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
