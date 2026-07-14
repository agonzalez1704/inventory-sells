"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Smartphone,
  PackageSearch,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CompatibleBox } from "./CompatibleBox";

export type PublicProduct = {
  id: string;
  nombre: string;
  marca: string | null;
  categoria: string | null;
  precio_cents: number;
  disponible: boolean;
  imagen: string | null;
};

export type Facet = { value: string; n: number };

export function TiendaView({
  productos,
  marcas,
  categorias,
  q,
  marca,
  cat,
  page,
  totalPages,
  total,
}: {
  productos: PublicProduct[];
  marcas: Facet[];
  categorias: Facet[];
  q: string;
  marca: string | null;
  cat: string | null;
  page: number;
  totalPages: number;
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [texto, setTexto] = useState(q);

  // Keep the box in sync when navigating back/forward.
  useEffect(() => setTexto(q), [q]);

  function go(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    // Any filter/search change restarts pagination.
    if (!("page" in next)) sp.delete("page");
    start(() => router.push(`/tienda?${sp.toString()}`, { scroll: false }));
  }

  // Debounced search — typing navigates without a submit.
  useEffect(() => {
    if (texto === q) return;
    const t = setTimeout(() => go({ q: texto || null }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const sinResultados = productos.length === 0;

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
            Busca por marca y modelo — “moto g42”, “redmi note 7”, “iPhone 13”.
            Precios claros y disponibilidad al día.
          </p>

          <div className="mt-7 max-w-xl">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Busca tu modelo (ej: moto g42, redmi note 7…)"
                aria-label="Buscar producto"
                className="h-[3.25rem] w-full rounded-xl border border-white/10 bg-white py-3.5 pl-11 pr-11 text-base text-slate-900 shadow-lg shadow-blue-950/20 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-blue-400"
              />
              {pending && (
                <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-blue-500" />
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        {/* Facets */}
        <div className="mt-6 space-y-2.5">
          <FacetRow
            label="Marca"
            options={marcas}
            active={marca}
            onPick={(v) => go({ marca: v })}
          />
          {categorias.length > 1 && (
            <FacetRow
              label="Tipo"
              options={categorias}
              active={cat}
              onPick={(v) => go({ cat: v })}
            />
          )}
        </div>

        {sinResultados ? (
          <div className="mt-10">
            <div className="flex flex-col items-center text-center text-slate-500">
              <PackageSearch className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">
                Sin resultados{q ? ` para “${q}”` : ""}
              </p>
              <p className="text-sm">Prueba con otra marca o modelo.</p>
            </div>
            {q && <CompatibleBox query={q} />}
          </div>
        ) : (
          <>
            <p className="mt-5 text-xs text-slate-500">
              {total} {total === 1 ? "producto" : "productos"}
              {q ? ` para “${q}”` : ""}
              {marca ? ` · ${marca}` : ""}
            </p>
            <div
              className={cn(
                "mt-3 grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 lg:grid-cols-4",
                pending && "opacity-60",
              )}
            >
              {productos.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              onGo={(n) => go({ page: String(n) })}
            />
          </>
        )}
      </div>
    </div>
  );
}

function FacetRow({
  label,
  options,
  active,
  onPick,
}: {
  label: string;
  options: Facet[];
  active: string | null;
  onPick: (v: string | null) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-medium text-slate-400">{label}</span>
      <Chip active={active === null} onClick={() => onPick(null)}>
        Todas
      </Chip>
      {options.map((o) => (
        <Chip
          key={o.value}
          active={active === o.value}
          onClick={() => onPick(active === o.value ? null : o.value)}
        >
          {o.value}
          <span className="ml-1 text-[10px] opacity-60">{o.n}</span>
        </Chip>
      ))}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onGo,
}: {
  page: number;
  totalPages: number;
  onGo: (n: number) => void;
}) {
  if (totalPages <= 1) return null;

  // Compact window around the current page.
  const nums: number[] = [];
  const from = Math.max(1, page - 2);
  const to = Math.min(totalPages, from + 4);
  for (let i = Math.max(1, to - 4); i <= to; i++) nums.push(i);

  return (
    <nav
      aria-label="Paginación"
      className="mt-8 flex flex-wrap items-center justify-center gap-1.5"
    >
      <PageBtn disabled={page <= 1} onClick={() => onGo(page - 1)} label="Anterior">
        <ChevronLeft className="h-4 w-4" />
      </PageBtn>
      {nums[0] > 1 && (
        <>
          <PageBtn onClick={() => onGo(1)}>1</PageBtn>
          {nums[0] > 2 && <span className="px-1 text-slate-400">…</span>}
        </>
      )}
      {nums.map((n) => (
        <PageBtn key={n} active={n === page} onClick={() => onGo(n)}>
          {n}
        </PageBtn>
      ))}
      {nums[nums.length - 1] < totalPages && (
        <>
          {nums[nums.length - 1] < totalPages - 1 && (
            <span className="px-1 text-slate-400">…</span>
          )}
          <PageBtn onClick={() => onGo(totalPages)}>{totalPages}</PageBtn>
        </>
      )}
      <PageBtn
        disabled={page >= totalPages}
        onClick={() => onGo(page + 1)}
        label="Siguiente"
      >
        <ChevronRight className="h-4 w-4" />
      </PageBtn>
    </nav>
  );
}

function PageBtn({
  children,
  onClick,
  active,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 min-w-9 cursor-pointer items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors",
        active
          ? "bg-blue-600 text-white shadow-sm shadow-blue-600/30"
          : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700",
        disabled && "cursor-not-allowed opacity-40 hover:border-slate-200 hover:text-slate-600",
      )}
    >
      {children}
    </button>
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

export function ProductCard({ p }: { p: PublicProduct }) {
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
