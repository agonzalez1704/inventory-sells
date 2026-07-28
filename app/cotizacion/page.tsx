import type { Metadata } from "next";
import { CotizacionPublica } from "@/modules/cotizaciones/CotizacionPublica";

export const metadata: Metadata = { title: "Tu cotización — Lead Displays", robots: { index: false } };

// Public — no auth, no token in the URL path. The share_token travels in the URL
// FRAGMENT (#token); the client component reads it and loads the quote over a
// POST, so the token never reaches the server as a query/path param.
export default function CotizacionPublicaPage() {
  return <CotizacionPublica />;
}
