"use client";

import { Sparkles, Loader2, Info, RefreshCw } from "lucide-react";
import { useCompat } from "@/modules/compat/useCompat";
import { buscarCompatibles, type CompatResult } from "./actions";
import { ProductCard } from "./TiendaView";

// The lookup failed, so we don't know the model — hand the customer to a human
// with their search already written out.
function waHref(query: string, whatsapp: string | null) {
  const text = encodeURIComponent(`Hola, busco pantalla para: ${query}`);
  return whatsapp ? `https://wa.me/${whatsapp}?text=${text}` : `https://wa.me/?text=${text}`;
}

// Zero results → offer an AI lookup of models that share the same panel. The
// call is MANUAL and debounced: the storefront is public, so it must never fire
// on its own (or on every keystroke). Answers are cached per session and in the
// DB, so a repeat click costs nothing.
export function CompatibleBox({
  query,
  whatsapp = null,
}: {
  query: string;
  whatsapp?: string | null;
}) {
  const { query: q, data, loading, fallo, run } = useCompat<CompatResult>(
    query,
    buscarCompatibles,
  );

  if (!q.trim()) return null;

  if (!data && !loading && !fallo) {
    return (
      <div className="mx-auto mt-8 max-w-lg rounded-2xl border border-dashed border-blue-200 bg-blue-50/40 p-5 text-center">
        <p className="text-sm text-slate-700">
          Muchas pantallas son <span className="font-medium">iguales entre modelos</span>.
          Podemos revisar si alguna que sí tenemos le queda a tu equipo.
        </p>
        <button
          onClick={run}
          className="mt-3 inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm shadow-blue-600/30 transition-colors hover:bg-blue-700"
        >
          <Sparkles className="h-4 w-4" />
          Buscar modelos compatibles
        </button>
      </div>
    );
  }

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

  // Lookup broke. Never tell a customer "no compatibles" on our own failure —
  // that's a lost sale over a bug. Offer a retry and the human channel.
  if (fallo) {
    return (
      <div className="mx-auto mt-8 max-w-lg rounded-2xl border border-slate-200 bg-white p-5 text-center">
        <p className="text-sm text-slate-700">
          No pudimos revisar la compatibilidad en este momento.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button
            onClick={run}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm shadow-blue-600/30 transition-colors hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4" />
            Reintentar
          </button>
          <a
            href={waHref(q, whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Pregúntanos por WhatsApp
          </a>
        </div>
      </div>
    );
  }

  if (!data || data.modelos.length === 0) {
    return (
      <div className="mx-auto mt-8 max-w-lg rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm text-slate-600">
        {data?.nota ??
          "No encontramos modelos compatibles. Escríbenos y lo conseguimos."}
      </div>
    );
  }

  return (
    <section className="mx-auto mt-8 max-w-5xl overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50/60 text-left">
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
