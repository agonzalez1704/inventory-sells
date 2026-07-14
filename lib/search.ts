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

function expand(token: string): string[] {
  return [token, ...(ALIASES.get(token) ?? [])];
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

// Score one query token against a product. 0 = no match.
function tokenScore(token: string, idx: Index): number {
  for (const term of expand(token)) {
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
  }
  return 0;
}

// Every query token must hit something (AND); the score ranks the survivors.
export function scoreProduct(p: Searchable, query: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const tokens = q.split(" ").filter(Boolean);
  if (!tokens.length) return 0;

  const idx = buildIndex(p);
  let score = 0;
  for (const token of tokens) {
    const s = tokenScore(token, idx);
    if (s === 0) return 0;
    score += s;
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
