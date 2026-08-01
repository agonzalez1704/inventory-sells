import "server-only";

// Next's Data Cache stores plain `fetch()` responses, and the InsForge SDK
// calls fetch with no cache options — so a server instance kept serving a
// STALE snapshot of the database for its whole life: sold-out flags for
// products that had stock, quote drafts that reappeared after being cleared.
// Every SDK client must read live data.
export const noStoreFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: "no-store" });
