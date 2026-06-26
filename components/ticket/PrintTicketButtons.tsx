"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Printer, Usb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { imprimirTicketNavegador, type TicketData } from "@/lib/ticket";
import { imprimirTicketUSB, webUsbDisponible } from "@/lib/escpos-usb";

// Print controls for a ticket: OS dialog (always) + direct WebUSB (when the
// browser supports it). `data` may be a value or a lazy getter.
export function PrintTicketButtons({
  data,
  size = "sm",
}: {
  data: TicketData | (() => TicketData);
  size?: "sm" | "md" | "lg";
}) {
  const [usbOk, setUsbOk] = useState(false);
  const [usbBusy, setUsbBusy] = useState(false);

  useEffect(() => {
    setUsbOk(webUsbDisponible());
  }, []);

  const resolve = () => (typeof data === "function" ? data() : data);

  async function usb() {
    setUsbBusy(true);
    try {
      await imprimirTicketUSB(resolve());
      toast.success("Enviado a la impresora");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo imprimir por USB");
    } finally {
      setUsbBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size={size} onClick={() => imprimirTicketNavegador(resolve())}>
        <Printer className="h-4 w-4" />
        Imprimir ticket
      </Button>
      {usbOk && (
        <Button variant="ghost" size={size} onClick={usb} loading={usbBusy} title="Impresión directa por USB (ESC/POS)">
          <Usb className="h-4 w-4" />
          USB
        </Button>
      )}
    </div>
  );
}
