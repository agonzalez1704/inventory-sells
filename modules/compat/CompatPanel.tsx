"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, Loader2, Info } from "lucide-react";
import { searchProducts, type Searchable } from "@/lib/search";
import { compatiblesStaff } from "./actions";
import type { Compat } from "@/lib/compat";

// Shown in Inventario / Ventas when a search returns nothing: asks the AI which
// models share the same part, then matches those against the products already
// loaded in the client. The caller renders each hit in its own style.
export function CompatPanel<T extends Searchable & { id: string }>({
  query,
  products,
  renderItem,
}: {
  query: string;
  products: T[];
  renderItem: (p: T) => React.ReactNode;
}) {
  const [data, setData] = useState<Compat | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);
    compatiblesStaff(query)
      .then((r) => alive && setData(r))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [query]);

  const hits = useMemo(() => {
    if (!data?.modelos.length) return [];
    const seen = new Set<string>();
    const out: T[] = [];
    for (const modelo of data.modelos) {
      for (const p of searchProducts(products, modelo, { limit: 4 })) {
        if (seen.has(p.id)) continue;
        seen.add(p.id);
        out.push(p);
      }
    }
    return out;
  }, [data, products]);

  if (loading) {
    return (
      <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-brand/30 bg-brand-soft/30 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-brand-foreground" />
        Buscando modelos compatibles…
      </div>
    );
  }

  if (!data || data.modelos.length === 0) return null;

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-brand/40 bg-brand-soft/20">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-soft text-brand-foreground">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold">Modelos compatibles</h3>
        </div>
        {data.nota && (
          <p className="mt-1.5 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-foreground" />
            {data.nota}
          </p>
        )}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {data.modelos.map((m) => (
            <span
              key={m}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium"
            >
              {m}
            </span>
          ))}
        </div>
      </div>

      <div className="p-3">
        {hits.length === 0 ? (
          <p className="px-1 py-2 text-sm text-muted-foreground">
            No tenemos en inventario ninguno de esos modelos compatibles.
          </p>
        ) : (
          <>
            <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-brand-foreground">
              Resultados de modelos compatibles
            </p>
            <div className="space-y-2">{hits.map((p) => renderItem(p))}</div>
          </>
        )}
      </div>
    </section>
  );
}
