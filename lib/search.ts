// Shared product search. Customers type "moto g42" / "redmi note 7" while the
// catalog stores the model shorthand ("G42 ORG") plus a brand column and a
// brand-prefixed sku ("motorola-g42-org"). A plain substring match finds
// nothing, so we tokenize, expand brand nicknames, and match per token.

export type Searchable = {
  name: string;
  sku?: string | null;
  brand?: string | null;
  category?: string | null;
};

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    // Strip combining accents BEFORE dropping non-alphanumerics, or "señor"
    // would become "sen or".
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Brand nicknames people actually type ↔ what the catalog stores. Grouped only
// where they're genuinely the same family (Xiaomi/Redmi/Poco, Huawei/Honor).
const ALIAS_GROUPS: string[][] = [
  ["motorola", "moto"],
  ["pantalla", "pantallas", "display"],
  ["xiaomi", "redmi", "poco", "mi"],
  ["samsung", "sam", "galaxy"],
  ["iphone", "iph", "apple"],
  ["huawei", "honor"],
];

const ALIASES = new Map<string, string[]>();
for (const group of ALIAS_GROUPS) {
  for (const term of group) {
    ALIASES.set(term, group.filter((t) => t !== term));
  }
}

// Conversational filler should not make a catalog lookup fail. Product nouns
// stay meaningful: "display", "pantalla" and "batería" are aliases above.
const QUERY_STOPWORDS = new Set([
  "a", "al", "buenas", "con", "de", "del", "el", "es", "hay", "hola", "la",
  "las", "lo", "los", "maneja", "manejas", "me", "para", "por", "que", "quiero",
  "tardes", "tendras", "tendrás", "tiene", "tienen", "tienes", "un", "una", "venden",
  "vendes",
]);

// A part code typed without its sub-family letter: "shn07" for SHNA0711.
//
// The counter knows a family as letters plus a number; the ERP slots a letter
// between them (SHN**A**0711, SHN**C**4501) and nobody memorises which. As a
// plain substring "shn07" is in none of them, so the search answered "Sin
// resultados" for a code the seller was reading off the shelf.
const CODIGO_PARTE = /^([a-z]+)(\d+)$/;

export function expand(token: string): string[] {
  const alias = ALIASES.get(token) ?? [];
  const m = CODIGO_PARTE.exec(token);
  // The extra term is a LIKE pattern, not a literal. normalize() drops every
  // non-alphanumeric character, so a customer can never type a % themselves —
  // this is the only place one enters the query.
  return m ? [token, `${m[1]}%${m[2]}`, ...alias] : [token, ...alias];
}

/**
 * The tokens a query actually searches on: normalized, filler dropped, and
 * single characters ignored.
 *
 * Exported so the SQL pre-filter (buscar_productos_candidatos) can narrow the
 * catalog with the SAME tokens this file scores by. If the two ever disagreed,
 * the database would withhold rows the scorer would have matched, and the miss
 * would be invisible — a product that simply never appears.
 */
export function tokensDeConsulta(query: string): string[] {
  return normalize(query)
    .split(" ")
    .filter((token) => token.length >= 2 && !QUERY_STOPWORDS.has(token));
}

type Index = {
  tokens: Set<string>;
  compact: string;
  name: string;
  nameCompact: string;
  sku: string;
  brand: string;
};

function buildIndex(p: Searchable): Index {
  const name = normalize(p.name);
  const sku = normalize(p.sku ?? "");
  const brand = normalize(p.brand ?? "");
  const category = normalize(p.category ?? "");
  const all = `${name} ${brand} ${sku} ${category}`;
  return {
    tokens: new Set(all.split(" ").filter(Boolean)),
    compact: all.replace(/ /g, ""),
    name,
    nameCompact: name.replace(/ /g, ""),
    sku,
    brand,
  };
}

// Where a term landed decides its weight: the model name matters most.
function weight(term: string, idx: Index): number {
  if (idx.name.includes(term)) return 3;
  if (idx.sku.includes(term)) return 2;
  if (idx.brand.includes(term)) return 2;
  return 1;
}

/**
 * "SHN 07", "SHN-07", "SHN*07" — the same part code with something between the
 * prefix and the number.
 *
 * There is nothing to choose between those separators: normalize() turns every
 * non-alphanumeric run into a space, so all three arrive here as the same two
 * tokens. What stopped them matching was the rule one line down — a pure number
 * must match a whole stored token, and "07" is not a token of "shna0711".
 *
 * Only used when the strict reading found nothing, so no query that works today
 * changes its answer.
 */
/**
 * Does this product's code read as `letras` + optional sub-family + `numero`?
 *
 * Anchored on purpose: the number has to start where the digits of the code
 * start. A plain substring would let "SHN 07" match SHNC2607, which is not the
 * 07 family — it just ends in those two digits.
 */
function codigoCoincide(letras: string, numero: string, sku: string): boolean {
  // The optional separator is what lets "iphone 12" match sku "iphone-12-…".
  // Without it, the part-code rule — written for "SHN 07" → "shnc2607" —
  // hijacked any brand-plus-number query and killed every display whose sku
  // hyphenates, while batteries (bat-iph-…) dodged the rule entirely by not
  // starting with the letters. The customer saw batteries only.
  return new RegExp(`^${letras}[a-z]*[-_ ]?${numero}`).test(sku);
}

function unirCodigo(tokens: string[]): string | null {
  if (tokens.length !== 2) return null;
  const [a, b] = tokens;
  return /^[a-z]+$/.test(a) && /^\d+$/.test(b) ? a + b : null;
}

// Score one query token against a product. 0 = no match.
function tokenScore(token: string, idx: Index): number {
  for (const term of expand(token)) {
    // The SQL pre-filter's wildcard form; the rule below covers it here.
    if (term.includes("%")) continue;

    // Exact token hit — the safest signal.
    if (idx.tokens.has(term)) return weight(term, idx);

    // Pure numbers must match a whole token: "7" must not match "70".
    if (/^\d+$/.test(term)) continue;

    // Short aliases ("mi", "iph") only count as exact tokens — a prefix match
    // would hit far too much.
    if (term.length < 3) continue;

    // Prefix of a stored token: "moto" → "motorola".
    for (const t of idx.tokens) {
      if (t.startsWith(term)) return weight(term, idx) - 0.5;
    }

    // Joined spelling: "note12" → "note 12".
    if (idx.compact.includes(term)) return 1;

    // Part code missing its sub-family letter: "shn07" → SHNA0711.
    //
    // A flat 1, not weight() minus something: weight() looks for the literal
    // term, which by definition is not in the row — that is the whole point of
    // this rule — so it always answered 1, and subtracting left 0, which the
    // caller reads as "no match". The rule silently did nothing.
    //
    // 1 also ranks it below an exact code (2) and below a clean prefix (1.5),
    // which is right: this is the loosest way a code can match.
    const m = CODIGO_PARTE.exec(term);
    if (m && codigoCoincide(m[1], m[2], idx.sku)) return 1;
  }
  return 0;
}

// Every query token must hit something (AND); the score ranks the survivors.
export function scoreProduct(p: Searchable, query: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const tokens = tokensDeConsulta(query);
  if (!tokens.length) return 0;

  const idx = buildIndex(p);
  let score = 0;
  let falla = false;
  for (const token of tokens) {
    const s = tokenScore(token, idx);
    if (s === 0) {
      falla = true;
      break;
    }
    score += s;
  }

  // A lone letters-then-number pair, where the letters open THIS product's
  // code, is a code search: the number has to be in the code too.
  //
  // Without this, "SHN 07" matched every SHN part whose NAME mentions an 07
  // model — a Silverado 07-18, an Altima 07-12, a CR-V 07-11 — because "07" is
  // a whole token of those names. Sixty right-hand control arms for other cars,
  // burying the 07 codes the seller asked for.
  //
  // Only when the letters open the code. "sentra 07" is not a code — no SKU
  // starts with "sentra" — so it keeps matching a Sentra by name and year.
  const par = unirCodigo(tokens);
  if (par && idx.sku.startsWith(tokens[0])) {
    return codigoCoincide(tokens[0], tokens[1], idx.sku) ? 2 : 0;
  }

  // Nothing matched every token. Before giving up, read the pair as one part
  // code: the seller typed the separator the shelf label has.
  if (falla) {
    if (!par) return 0;
    const s = tokenScore(par, idx);
    if (s === 0) return 0;
    score = s;
  }

  // Reward the whole query appearing in the model name, and an exact name.
  const qCompact = q.replace(/ /g, "");
  if (idx.nameCompact.includes(qCompact)) score += 5;
  if (idx.name === q) score += 10;
  return score;
}

export function matchesQuery(p: Searchable, query: string): boolean {
  return scoreProduct(p, query) > 0;
}

// Filter + rank. `tieBreak` keeps a stable, meaningful order among equal scores
// (callers pass e.g. in-stock-first).
export function searchProducts<T extends Searchable>(
  items: T[],
  query: string,
  opts?: { limit?: number; tieBreak?: (a: T, b: T) => number },
): T[] {
  const q = query.trim();
  if (!q) return opts?.limit ? items.slice(0, opts.limit) : items;

  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const score = scoreProduct(item, q);
    if (score > 0) scored.push({ item, score });
  }
  scored.sort(
    (a, b) => b.score - a.score || (opts?.tieBreak?.(a.item, b.item) ?? 0),
  );
  const out = scored.map((s) => s.item);
  return opts?.limit ? out.slice(0, opts.limit) : out;
}
