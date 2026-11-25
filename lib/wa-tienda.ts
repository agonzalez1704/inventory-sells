import { MARCA } from "@/lib/marca";

// The shop's public WhatsApp: the storefront chrome and the Ruli landing both
// link to it. STORE_WHATSAPP is digits with country code (52…).

export function waHref(whatsapp: string | null) {
  const text = encodeURIComponent(`Hola ${MARCA.tienda.nombre}, me interesa una refacción`);
  return whatsapp ? `https://wa.me/${whatsapp}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function prettyPhone(w: string | null): string | null {
  if (!w) return null;
  const d = w.replace(/\D/g, "");
  const local = d.startsWith("52") ? d.slice(2) : d;
  if (local.length !== 10) return `+${d}`;
  return `+52 ${local.slice(0, 2)} ${local.slice(2, 6)} ${local.slice(6)}`;
}
