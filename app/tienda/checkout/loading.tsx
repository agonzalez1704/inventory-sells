import { Loader2 } from "lucide-react";

// Same container and first state as CheckoutView ("Preparando tu pedido…"),
// so the swap from fallback to the client view does not jump.
export default function Loading() {
  return (
    <div aria-busy className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Preparando tu pedido…
      </div>
    </div>
  );
}
