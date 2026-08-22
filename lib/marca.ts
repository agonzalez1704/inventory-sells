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

export type ValorBase = "venta" | "costo";

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
  /** Favicon / app icon. A static file per brand: the browser fetches it on its
   *  own, so it cannot use the CSS variables the in-app logo relies on. */
  icono: string;
  /** The storefront hero photo — brand-specific, like the icon. Composed with
   *  the subject on the RIGHT: the copy lives in the empty left third. */
  hero: string;
  /** How the inventory header values stock when nobody has chosen in Configuración:
   *  Ruli reads it as what the stock cost, Fiable as what it is worth to sell. */
  valorBase: ValorBase;
  /** The public storefront's own identity.
   *
   *  Deliberately separate from `nombre`: that one is what the staff call this
   *  app, and a customer has never heard it. Fiable's shop is Lead Displays,
   *  and every customer-facing string has to reach for this one instead. */
  tienda: {
    nombre: string;
    tagline: string;
    descripcion: string;
    /** The storefront's accent ramp, 50→950, as raw HSL channels.
     *
     *  A full ramp rather than one hue: the shop uses the whole scale — tints
     *  for panels, mid tones for links, dark ends for the footer — and a single
     *  colour lightened by opacity looks washed out at the pale end.
     *
     *  Separate from `brand` for the same reason `tienda.nombre` is separate
     *  from `nombre`: the shop is its own brand. Fiable's back office is amber
     *  and Lead Displays is blue, and that is on purpose, not drift. */
    acento: Record<50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950, string>;
  };
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
    icono: "/icono-fiable.svg",
    hero: "/hero.webp",
    valorBase: "venta",
    tienda: {
      nombre: "Lead Displays",
      tagline: "Pantallas y refacciones para celular",
      descripcion:
        "Catálogo de pantallas, baterías y refacciones para tu celular. Explora modelos y disponibilidad.",
      // Tailwind's own blue, channel for channel: Lead Displays already ships
      // in it and this move is meant to change nothing for them.
      acento: {
        50: "214 100% 97%",
        100: "214 95% 93%",
        200: "213 97% 87%",
        300: "212 96% 78%",
        400: "213 94% 68%",
        500: "217 91% 60%",
        600: "221 83% 53%",
        700: "224 76% 48%",
        800: "226 71% 40%",
        900: "224 64% 33%",
        950: "226 57% 21%",
      },
    },
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
    icono: "/icono-ruli.svg",
    hero: "/hero-ruli.webp",
    valorBase: "costo",
    tienda: {
      nombre: "Refaccionaria Ruli",
      tagline: "Refacciones y autopartes",
      descripcion:
        "Catálogo de refacciones y autopartes. Consulta modelos, precios y disponibilidad.",
      // The storefront sign's red. 600 is the brand base exactly, so the shop's
      // primary and the app's brand are the same colour rather than two reds
      // that almost match.
      acento: {
        50: "357 100% 97%",
        100: "357 94% 94%",
        200: "357 96% 89%",
        300: "357 94% 82%",
        400: "357 91% 71%",
        500: "357 84% 60%",
        600: "357 75% 48%",
        700: "357 78% 41%",
        800: "357 74% 34%",
        900: "357 66% 30%",
        950: "357 78% 15%",
      },
    },
  },
};

const pedida = process.env.NEXT_PUBLIC_MARCA?.trim().toLowerCase();

// The deploy guide told the team to set NEXT_PUBLIC_MARCA=refaccionaria while
// the code only ever knew "ruli", so Ruli's deploy resolved to Fiable and had
// been serving Fiable's name, colours and favicon. Both spellings are accepted
// rather than making anyone go and edit a variable in Vercel to un-break a
// live deploy.
const ALIAS: Record<string, MarcaId> = {
  fiable: "fiable",
  ruli: "ruli",
  refaccionaria: "ruli",
};

// Unset falls back to fiable: that is local development and the checkout, and
// a missing variable there should not stop anyone working.
//
// Set to something unrecognised THROWS, which fails the build. The old code
// fell back here too, and quietly — the cost of that convenience was one
// business running for weeks under the other's brand, on a value nobody could
// see was wrong because everything still rendered. A failed deploy names the
// problem in one line; a silent fallback hands the wrong shop to the wrong
// customer.
if (pedida && !ALIAS[pedida]) {
  throw new Error(
    `NEXT_PUBLIC_MARCA="${pedida}" no existe. Usa: ${Object.keys(ALIAS).join(", ")}.`,
  );
}

export const MARCA: Marca = MARCAS[(pedida && ALIAS[pedida]) || "fiable"];

/** The --brand* block for this brand, injected into the root layout. */
export function brandCssVars(): string {
  const b = MARCA.brand;
  const acento = Object.entries(MARCA.tienda.acento)
    .map(([paso, hsl]) => `--tienda-${paso}:${hsl};`)
    .join("");
  return (
    `:root{--brand:${b.base};--brand-strong:${b.strong};` +
    `--brand-soft:${b.soft};--brand-foreground:${b.foreground};${acento}}`
  );
}
