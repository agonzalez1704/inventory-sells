"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2, Info } from "lucide-react";
import { buscarCompatibles, type CompatResult } from "./actions";
import { ProductCard } from "./TiendaView";

// Zero results → ask the AI which models share the same panel, then show what
// we actually have in stock for those. Runs on the client so the page itself
// stays fast (the AI call only happens on a miss).
export function CompatibleBox({ query }: { query: string }) {
  const [data, setData] = useState<CompatResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);
    buscarCompatibles(query)
      .then((r) => alive && setData(r))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [query]);

  if (loading) {
    return (
      <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
        <div className="flex items-center gap-2.5 text-sm text-blue-800">
          <Loader2 className="h-4 w-4 animate-spin" />
          Buscando modelos compatibles…
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="aspect-square animate-pulse rounded-xl bg-blue-100/60"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!data || data.modelos.length === 0) return null;

  return (
    <section className="mx-auto mt-8 max-w-5xl overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50/60">
      <div className="border-b border-blue-100 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Sparkles className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-semibold text-slate-900 [font-family:var(--font-display)]">
            No lo tenemos, pero hay modelos compatibles
          </h2>
        </div>
        {data.nota && (
          <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-slate-600">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
            {data.nota}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.modelos.map((m) => (
            <span
              key={m}
              className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-xs font-medium text-blue-800"
            >
              {m}
            </span>
          ))}
        </div>
      </div>

      <div className="p-5">
        {data.productos.length === 0 ? (
          <p className="text-sm text-slate-600">
            Por ahora no tenemos en existencia ninguno de esos modelos
            compatibles. Escríbenos y lo conseguimos.
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-blue-700">
              Resultados de modelos compatibles
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {data.productos.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
