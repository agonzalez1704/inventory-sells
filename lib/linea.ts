import { MARCA } from "@/lib/marca";

/**
 * Ruli's economy line: the same part with an "-S" on the number (6709052-S is
 * Grob's línea económica of 6709052). Null everywhere else.
 */
export function lineaDeSku(sku: string): string | null {
  return MARCA.id === "ruli" && /-S$/i.test(sku.trim()) ? "Línea económica" : null;
}
