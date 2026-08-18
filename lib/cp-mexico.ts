import "server-only";

/**
 * Postal code → state, municipality and colonias.
 *
 * The checkout used to ask for all four. Three of them are implied by the fifth,
 * and asking anyway costs two required fields on a form whose abandonment rate
 * is the thing we are trying to move.
 *
 * Measured against the live Skydropx API before writing this: quoting 37000 →
 * 64000 returns the same 14 rates and the same $51.25 cheapest whether the
 * municipality is "Monterrey" or "Xyzzy" — but ZERO rates when it is empty. The
 * carrier prices by postal code; area_level2 is a required string it does not
 * read. So filling it from the lookup is safe, and leaving it blank is not.
 */

export type LugarCP = {
  estado: string;
  municipio: string;
  colonias: string[];
};

// The API answers with the pre-2016 name for Mexico City, which is not what the
// checkout's state list calls it — and CDMX is the single biggest destination.
// Left unmapped it silently fails for the whole city.
const ALIAS_ESTADO: Record<string, string> = {
  "distrito federal": "Ciudad de Mexico",
  "mexico": "Estado de Mexico",
  "veracruz de ignacio de la llave": "Veracruz",
  "michoacan de ocampo": "Michoacan",
  "coahuila de zaragoza": "Coahuila",
};

const sinAcentos = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * Never throws and never blocks the form. A failed lookup means the customer
 * types the two fields themselves, exactly as they do today — the feature is a
 * shortcut, not a dependency, and a checkout that dies because a free postal
 * code API is down would be a worse trade than the typing it saves.
 */
export async function buscarCP(cp: string): Promise<LugarCP | null> {
  if (!/^\d{5}$/.test(cp)) return null;
  try {
    const r = await fetch(`https://api.zippopotam.us/mx/${cp}`, {
      signal: AbortSignal.timeout(4000),
      // Postal codes do not move. Cached for a day so a busy checkout does not
      // hammer a service nobody is paying for.
      next: { revalidate: 86400 },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      places?: { "place name"?: string; state?: string }[];
    };
    const lugares = j.places ?? [];
    if (lugares.length === 0) return null;

    const crudo = sinAcentos(lugares[0].state ?? "");
    const estado = ALIAS_ESTADO[crudo.toLowerCase()] ?? crudo;

    // "place name" is the colonia, not the municipality — "Monterrey Centro" is
    // a neighbourhood. Since the carrier ignores this field's contents, the
    // first colonia is a good enough non-empty value, and the customer can
    // correct it.
    const colonias = [...new Set(lugares.map((l) => sinAcentos(l["place name"] ?? "")).filter(Boolean))];
    return { estado, municipio: colonias[0] ?? "", colonias };
  } catch {
    return null;
  }
}
