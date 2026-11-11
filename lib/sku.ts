import { MARCA } from "@/lib/marca";

/**
 * The key a part number is stored and looked up by. Ruli's part numbers are
 * case-blind (K-7257 and k-7257 are one part, typed by two people), so they
 * are kept uppercase; Fiable's SKUs are lowercase slugs and stay as typed.
 */
export const claveSku = (sku: string) => (MARCA.id === "ruli" ? sku.trim().toUpperCase() : sku.trim());
