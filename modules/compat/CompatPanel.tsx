"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2, Info, AlertTriangle } from "lucide-react";
import type { Searchable } from "@/lib/search";
import { Button } from "@/components/ui/button";
import { compatiblesStaff } from "./actions";
import { useCompat } from "./useCompat";

// Shown in Inventario / Ventas when a search returns nothing. The AI lookup is
// MANUAL: firing it per keystroke would cost a model call for every partial
// query. The user asks for it; answers are cached (session + DB).
//
// `buscar` looks each suggested model up on the server rather than filtering a
// client-side array. Once the catalog stopped being shipped whole, a local
// search here would only ever see the current page and report "we stock none of
// these" — a catalog fact staff quote customers on, and wrong. Pass a stable
// reference (useCallback); it is a dependency of the lookup effect.
export function CompatPanel<T extends Searchable & { id: string }>({
  query,
  buscar,
  renderItem,
}: {
  query: string;
  buscar: (modelo: string) => Promise<T[]>;
  renderItem: (p: T) => React.ReactNode;
}) {
  const { query: q, data, loading, fallo, run } = useCompat(query, compatiblesStaff);
  const [hits, setHits] = useState<T[]>([]);

  useEffect(() => {
    if (!data?.modelos.length) {
      setHits([]);
      return;
    }
    let cancelado = false;
    (async () => {
      // All models at once — sequentially this would be one round trip per
      // suggestion while the seller waits.
      const porModelo = await Promise.all(data.modelos.map((m) => buscar(m)));
      const seen = new Set<string>();
      const out: T[] = [];
      for (const lista of porModelo) {
        for (const p of lista) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          out.push(p);
        }
      }
      if (!cancelado) setHits(out);
    })().catch(() => {
      if (!cancelado) setHits([]);
    });
    return () => {
      cancelado = true;
    };
  }, [data, buscar]);

  if (!q.trim()) return null;

  // Idle — offer the lookup, don't spend on it.
  if (!data && !loading && !fallo) {
    return (
      <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-4 text-center">
        <p className="text-xs text-muted-foreground">
          ¿Buscas un modelo que no manejamos? Puede haber pantallas compatibles.
        </p>
        <Button variant="secondary" size="sm" onClick={run}>
          <Sparkles className="h-4 w-4" />
          Buscar modelos compatibles
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-brand/30 bg-brand-soft/30 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-brand-foreground" />
        Buscando modelos compatibles…
      </div>
    );
  }

  // The lookup broke — say so. Claiming "no compatible models" here is a lie
  // that reads as a catalog fact, and staff quote customers off it.
  if (fallo) {
    return (
      <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-4 text-center">
        <p className="flex items-center gap-1.5 text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          No pudimos verificar compatibilidad ahora.
        </p>
        <p className="text-xs text-amber-800 dark:text-amber-300">
          Es una falla del servicio, no quiere decir que no haya compatibles.
        </p>
        <Button variant="secondary" size="sm" onClick={run}>
          Reintentar
        </Button>
      </div>
    );
  }

  if (!data || data.modelos.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">
        {data?.nota ?? "No encontramos modelos compatibles para esa búsqueda."}
      </div>
    );
  }

  return (
    <section className="mt-4 overflow-hidden rounded-xl border border-brand/40 bg-brand-soft/20 text-left">
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
