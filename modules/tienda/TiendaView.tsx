"use client";

import { useMemo, useState } from "react";
import { Search, Smartphone, PackageSearch } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export type PublicProduct = {
  id: string;
  nombre: string;
  marca: string | null;
  categoria: string | null;
  precio_cents: number;
  disponible: boolean;
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
    <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      {/* Hero */}
      <section className="relative mt-6 overflow-hidden rounded-3xl border border-border bg-dots px-6 py-12 text-center sm:py-16">
        <Logo className="mx-auto mb-5 h-9 w-auto text-foreground" />
        <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          Catálogo
        </span>
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Pantallas, baterías y refacciones
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-pretty text-sm text-muted-foreground sm:text-base">
          Explora nuestro inventario. Para comprar o cotizar, escríbenos por
          WhatsApp con el modelo que buscas.
        </p>
      </section>

      {/* Search */}
      <div className="sticky top-16 z-10 -mx-4 mt-6 bg-background/80 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:px-0">
        <div className="relative mx-auto max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busca tu modelo (ej: iPhone 13, Redmi Note 12…)"
            className="h-12 pl-9 text-base"
          />
        </div>
      </div>

      {/* Category chips */}
      {categorias.length > 1 && (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
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
        <EmptyState
          icon={PackageSearch}
          title="Sin resultados"
          description="Prueba con otro modelo o marca."
          className="mt-8"
        />
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {mostrados.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
          {filtrados.length > LIMITE && (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Mostrando {LIMITE} de {filtrados.length}. Usa el buscador para
              encontrar tu modelo.
            </p>
          )}
        </>
      )}
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
        "cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ProductCard({ p }: { p: PublicProduct }) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border border-border bg-background p-3 shadow-card transition-colors",
        !p.disponible && "opacity-70",
      )}
    >
      <div className="mb-3 flex aspect-square items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Smartphone className="h-8 w-8" />
      </div>
      <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-tight">
        {p.nombre}
      </p>
      {(p.marca || p.categoria) && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {[p.marca, p.categoria].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold tabular-nums">
          {p.precio_cents > 0 ? formatMXN(p.precio_cents) : "A cotizar"}
        </span>
        <Badge tone={p.disponible ? "accent" : "neutral"}>
          {p.disponible ? "Disponible" : "Agotado"}
        </Badge>
      </div>
    </div>
  );
}
