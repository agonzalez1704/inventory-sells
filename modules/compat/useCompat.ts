"use client";

import { useCallback, useEffect, useState } from "react";
import type { Compat } from "@/lib/compat";

// Debounce a value — the compat query settles before we let anyone spend tokens
// on it.
export function useDebounced<T>(value: T, ms = 500): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// Per-session cache on top of the DB cache: re-opening the same zero-result
// search doesn't even hit the server.
const CACHE = new Map<string, Compat>();

const key = (q: string) => q.trim().toLowerCase();

// Manual-trigger AI lookup. Never fires on its own — the user has to ask for it
// (an AI call per keystroke would burn tokens for nothing).
export function useCompat<T extends Compat>(
  query: string,
  fetcher: (q: string) => Promise<T>,
) {
  const q = useDebounced(query, 500);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);

  // A new query resets the panel — but a cached answer shows immediately, free.
  useEffect(() => {
    setData((CACHE.get(key(q)) as T | undefined) ?? null);
    setLoading(false);
  }, [q]);

  const run = useCallback(() => {
    const k = key(q);
    const hit = CACHE.get(k) as T | undefined;
    if (hit) {
      setData(hit);
      return;
    }
    setLoading(true);
    fetcher(q)
      .then((r) => {
        CACHE.set(k, r);
        setData(r);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [q, fetcher]);

  return { query: q, data, loading, run };
}
