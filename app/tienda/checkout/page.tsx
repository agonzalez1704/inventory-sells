import type { Metadata } from "next";
import { CheckoutView } from "@/modules/tienda/CheckoutView";

export const metadata: Metadata = {
  title: "Finalizar compra — Lead Displays",
  robots: { index: false }, // a checkout has nothing to index
};

// The cart lives in the browser, so the page itself is a shell — pricing,
// availability and shipping are all resolved server-side from the client.
export default function CheckoutPage() {
  return <CheckoutView />;
}
