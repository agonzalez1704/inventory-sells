"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Smartphone, PackageSearch, ShieldCheck } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";

export type PublicProduct = {
  id: string;
  nombre: string;
  marca: string | null;
  categoria: string | null;
  precio_cents: number;
  disponible: boolean;
  imagen: string | null;
};

const LIMITE = 150;

export function TiendaView({ productos }: { productos: PublicProduct[] }) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string | null>(null);

  const categorias = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of productos)
      if (p.categoria) m.set(p.categoria, (m.get(p.categoria) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [productos]);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return productos.filter((p) => {
      if (cat && p.categoria !== cat) return false;
      if (!q) return true;
      const hay = `${p.nombre} ${p.marca ?? ""} ${p.categoria ?? ""}`.toLowerCase();
      return q.split(/\s+/).every((t) => hay.includes(t));
    });
  }, [productos, query, cat]);

  const mostrados = filtrados.slice(0, LIMITE);

  return (
    <div>
      {/* Hero — deep blue = trust / technology */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-400/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-indigo-500/20 blur-3xl"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-blue-50">
            <ShieldCheck className="h-3.5 w-3.5" />
            Refacciones con garantía
          </span>
          <h1 className="mt-5 max-w-2xl text-balance text-3xl font-semibold leading-tight tracking-tight [font-family:var(--font-display)] sm:text-5xl">
            Pantallas y refacciones para tu celular
          </h1>
          <p className="mt-4 max-w-xl text-pretty text-sm text-blue-100 sm:text-base">
            Explora nuestro catálogo por modelo. Precios claros y disponibilidad
            al día. Para comprar, escríbenos con el modelo que buscas.
          </p>

          {/* Search on the hero */}
          <div className="mt-7 max-w-xl">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Busca tu modelo (ej: iPhone 13, Redmi Note 12…)"
                className="h-[3.25rem] w-full rounded-xl border border-white/10 bg-white py-3.5 pl-11 pr-4 text-base text-slate-900 shadow-lg shadow-blue-950/20 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        {/* Category chips */}
        {categorias.length > 1 && (
          <div className="mt-6 flex flex-wrap gap-1.5">
            <Chip active={cat === null} onClick={() => setCat(null)}>
              Todos
            </Chip>
            {categorias.map((c) => (
              <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
                {c}
              </Chip>
            ))}
          </div>
        )}

        {/* Grid */}
        {mostrados.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center text-slate-500">
            <PackageSearch className="h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">Sin resultados</p>
            <p className="text-sm">Prueba con otro modelo o marca.</p>
          </div>
        ) : (
          <>
            <p className="mt-5 text-xs text-slate-500">
              {filtrados.length} {filtrados.length === 1 ? "producto" : "productos"}
              {cat ? ` en ${cat}` : ""}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {mostrados.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
            {filtrados.length > LIMITE && (
              <p className="mt-6 text-center text-sm text-slate-500">
                Mostrando {LIMITE} de {filtrados.length}. Usa el buscador para
                encontrar tu modelo.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-blue-600 text-white shadow-sm shadow-blue-600/30"
          : "border border-blue-100 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700",
      )}
    >
      {children}
    </button>
  );
}

function ProductCard({ p }: { p: PublicProduct }) {
  return (
    <Link
      href={`/tienda/${p.id}`}
      className={cn(
        "group flex flex-col rounded-2xl border border-slate-200 bg-white p-3 transition-all hover:border-blue-300 hover:shadow-lg hover:shadow-blue-900/5",
        !p.disponible && "opacity-75",
      )}
    >
      <div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-white">
        {p.imagen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.imagen}
            alt={p.nombre}
            loading="lazy"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 to-slate-50 text-blue-400 transition-colors group-hover:text-blue-500">
            <Smartphone className="h-9 w-9" />
          </div>
        )}
      </div>
      <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-tight text-slate-900">
        {p.nombre}
      </p>
      {(p.marca || p.categoria) && (
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {[p.marca, p.categoria].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-semibold tabular-nums text-blue-800 [font-family:var(--font-display)]">
          {p.precio_cents > 0 ? formatMXN(p.precio_cents) : "A cotizar"}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
            p.disponible
              ? "bg-green-100 text-green-700"
              : "bg-slate-100 text-slate-500",
          )}
        >
          {p.disponible ? "Disponible" : "Agotado"}
        </span>
      </div>
    </Link>
  );
}
