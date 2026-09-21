"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { imprimirTicketNavegador, type TicketData } from "@/lib/ticket";

// Prints through the browser. At the counter Chrome runs with
// --kiosk-printing, which sends it straight to the default printer with no
// dialog. Direct WebUSB printing was removed: every counter's OS driver owns
// the USB port, so the browser only ever got "Access denied".
export function PrintTicketButtons({
  data,
  size = "sm",
}: {
  data: TicketData | (() => TicketData);
  size?: "sm" | "md" | "lg";
}) {
  return (
    <Button
      variant="ghost"
      size={size}
      onClick={() => imprimirTicketNavegador(typeof data === "function" ? data() : data)}
    >
      <Printer className="h-4 w-4" />
      Imprimir ticket
    </Button>
  );
}
