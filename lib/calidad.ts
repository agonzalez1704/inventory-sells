// Screen quality read from the product name (ORG / OLED / INCELL / AAA). It's
// the customer's first question — and competitors sell it as a top-level filter
// ("Displays Nuevos" vs "Seminuevos") — so it gets its own facet.
// Not the frame: C/M = con marco, S/M = sin marco.

export const CALIDADES = ["Original", "OLED", "Incell", "AAA"] as const;
export type Calidad = (typeof CALIDADES)[number];

export const CALIDAD_LABEL: Record<Calidad, string> = {
  Original: "Original",
  OLED: "OLED",
  Incell: "Incell",
  AAA: "AAA (genérica)",
};

export function calidadDe(nombre: string): Calidad | null {
  const n = nombre.toUpperCase();
  if (/\bORIGINAL\b|\bORG\b|\bOEM\b/.test(n)) return "Original";
  if (/\bOLED\b/.test(n)) return "OLED";
  if (/\bINCELL\b/.test(n)) return "Incell";
  if (/\bAAA\b/.test(n)) return "AAA";
  return null;
}

export function marcoDe(nombre: string): string | null {
  const n = nombre.toUpperCase();
  if (/\bC\/M\b/.test(n)) return "Con marco";
  if (/\bS\/M\b/.test(n)) return "Sin marco";
  return null;
}
