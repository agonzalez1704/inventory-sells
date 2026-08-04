// Whitelabel: one repo serves two businesses from two separate databases, so
// everything brand-specific resolves here from a single build-time variable.
//
// This is build-time on purpose. The PWA manifest, the page metadata and the
// CSS custom properties are produced before any session or query exists —
// resolving them from the database would make those paths dynamic and slower
// for nothing. Anything that should change WITHOUT a redeploy (business hours,
// address, advisor phones) belongs in config_negocio instead, which already
// lives in each business's own database.

export type MarcaId = "fiable" | "ruli";

export type Marca = {
  id: MarcaId;
  /** Full name, for titles and customer-facing text. */
  nombre: string;
  /** Short name for the PWA icon under the home screen. */
  corto: string;
  descripcion: string;
  /** Brand colours as raw HSL channels, injected as --brand* custom properties. */
  brand: { base: string; strong: string; soft: string; foreground: string };
  /** PWA theme colour (hex) — the OS chrome around the installed app. */
  themeColor: string;
};

const MARCAS: Record<MarcaId, Marca> = {
  fiable: {
    id: "fiable",
    nombre: "Fiable",
    corto: "Fiable",
    descripcion: "Inventario, ventas y notas de crédito",
    // Logo gradient: gold #FFD200 → amber #FBB042
    brand: {
      base: "36 95% 62%",
      strong: "49 100% 50%",
      soft: "45 100% 95%",
      foreground: "30 65% 24%",
    },
    themeColor: "#0f172a",
  },
  ruli: {
    id: "ruli",
    nombre: "Refaccionaria Ruli",
    corto: "Ruli",
    descripcion: "Refacciones, inventario y ventas",
    // Storefront sign: bright signal red on grey. The neutral slate scale
    // already carries the grey, so the brand token is the red.
    brand: {
      base: "357 75% 48%",
      strong: "357 85% 40%",
      soft: "357 100% 96%",
      foreground: "357 70% 25%",
    },
    themeColor: "#1f2937",
  },
};

const pedida = process.env.NEXT_PUBLIC_MARCA;

// Unknown or unset falls back to fiable — the business running today. A typo in
// an env var should not produce a nameless app.
export const MARCA: Marca =
  (pedida && MARCAS[pedida as MarcaId]) || MARCAS.fiable;

/** The --brand* block for this brand, injected into the root layout. */
export function brandCssVars(): string {
  const b = MARCA.brand;
  return `:root{--brand:${b.base};--brand-strong:${b.strong};--brand-soft:${b.soft};--brand-foreground:${b.foreground};}`;
}
