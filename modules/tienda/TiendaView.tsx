"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Smartphone,
  PackageSearch,
  ShieldCheck,
  Truck,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Loader2,
  Clock,
  MapPin,
  Zap,
} from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { TIENDA } from "@/lib/tienda-info";
import { AddToCart } from "./AddToCart";
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

function waHref(nombre: string, whatsapp: string | null) {
  const text = encodeURIComponent(`Hola Lead Displays, me interesa: ${nombre}`);
  return whatsapp ? `https://wa.me/${whatsapp}?text=${text}` : `https://wa.me/?text=${text}`;
}

export function TiendaView({
  productos,
  marcas,
  categorias,
  calidades,
  q,
  marca,
  cat,
  cal,
  page,
  totalPages,
  total,
  whatsapp,
}: {
  productos: PublicProduct[];
  marcas: Facet[];
  categorias: Facet[];
  calidades: Facet[];
  q: string;
  marca: string | null;
  cat: string | null;
  cal: string | null;
  page: number;
  totalPages: number;
  total: number;
  whatsapp: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [texto, setTexto] = useState(q);

  useEffect(() => setTexto(q), [q]);

  function go(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
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

  const filtrando = Boolean(q || marca || cat || cal);
  const sinResultados = productos.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
      {/* Hero */}
      <section className="relative mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white">
        {/* Product imagery sits on the right; the copy lives in the empty left
            third the image was composed around. Hidden on phones, where it
            would squash the headline. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hero.webp"
            alt=""
            className="h-full w-full object-cover object-right"
          />
          {/* Full-width wash instead of a panel: any hard edge between the flat
              gradient and the photo reads as a seam. */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-700 from-25% via-blue-700/70 via-55% to-transparent" />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -left-16 h-80 w-80 rounded-full bg-indigo-400/20 blur-3xl"
        />
        <div className="relative px-6 py-10 sm:px-10 sm:py-14 md:max-w-[52%]">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-blue-50">
            <BadgeCheck className="h-3.5 w-3.5" />
            Calidad original y genérica
          </span>
          <h1 className="mt-4 max-w-2xl text-balance text-3xl font-semibold leading-tight tracking-tight [font-family:var(--font-display)] sm:text-5xl">
            La refacción que tu celular necesita
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-sm text-blue-100 sm:text-base">
            Pantallas, baterías y más — busca por marca y modelo. Precios claros,
            disponibilidad al día.
          </p>

          {/* The one thing no competitor carries — as text, where it converts. */}
          <p className="mt-4 inline-flex items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-400/15 px-3 py-2 text-xs font-semibold text-amber-100 sm:text-sm">
            <Zap className="h-4 w-4 shrink-0 text-amber-300" />
            Baterías diagnóstico (auto-programables) para iPhone
          </p>

          <div className="mt-6 max-w-xl">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Busca tu modelo (ej: moto g42, redmi note 7…)"
                aria-label="Buscar producto"
                className="h-[3.25rem] w-full rounded-2xl border border-white/10 bg-white py-3.5 pl-11 pr-11 text-base text-slate-900 shadow-lg shadow-blue-950/25 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-blue-300"
              />
              {pending && (
                <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-blue-500" />
              )}
            </div>
          </div>

          {/* Quantified promises — competitors state a delivery time instead of
              just "we ship". No free-shipping claim: see lib/tienda-info.ts. */}
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-blue-100">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> Entrega en {TIENDA.entregaDias}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" /> {TIENDA.garantiaDias} días de garantía
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Truck className="h-4 w-4" /> Envíos a todo México
            </span>
          </div>
        </div>
      </section>

      {/* Marcas populares — hidden while actively filtering to avoid noise */}
      {!filtrando && marcas.length > 1 && (
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 [font-family:var(--font-display)]">
              Marcas populares
            </h2>
          </div>
          <div className="mt-4 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {marcas.slice(0, 10).map((m) => (
              <button
                key={m.value}
                onClick={() => go({ marca: m.value })}
                className="group flex w-24 shrink-0 flex-col items-center gap-2"
              >
                <span className="flex h-20 w-20 items-center justify-center rounded-2xl border border-blue-100 bg-white text-blue-700 shadow-sm transition-all group-hover:-translate-y-0.5 group-hover:border-blue-300 group-hover:shadow-md group-hover:shadow-blue-900/5">
                  <span className="text-lg font-bold [font-family:var(--font-display)]">
                    {m.value.slice(0, 2).toUpperCase()}
                  </span>
                </span>
                <span className="w-full truncate text-center text-xs font-medium text-slate-600 group-hover:text-blue-700">
                  {m.value}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Catálogo */}
      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 [font-family:var(--font-display)]">
            {filtrando ? "Resultados" : "Catálogo"}
          </h2>
          {filtrando && (
            <button
              onClick={() => go({ q: null, marca: null, cat: null, cal: null })}
              className="text-xs font-medium text-blue-700 hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {/* Facets — quality first: it's the customer's #1 question and what
            competitors surface as top-level nav ("Nuevos" vs "Seminuevos"). */}
        <div className="mt-3 space-y-2.5">
          {calidades.length > 1 && (
            <FacetRow
              label="Calidad"
              options={calidades}
              active={cal}
              onPick={(v) => go({ cal: v })}
            />
          )}
          <FacetRow label="Marca" options={marcas} active={marca} onPick={(v) => go({ marca: v })} />
          {categorias.length > 1 && (
            <FacetRow label="Tipo" options={categorias} active={cat} onPick={(v) => go({ cat: v })} />
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
            {q && <CompatibleBox query={q} whatsapp={whatsapp} />}
          </div>
        ) : (
          <>
            <p className="mt-4 text-xs text-slate-500">
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
                <ProductCard key={p.id} p={p} whatsapp={whatsapp} />
              ))}
            </div>

            <Pagination page={page} totalPages={totalPages} onGo={(n) => go({ page: String(n) })} />
          </>
        )}
      </section>

      {/* Objection killers — competitors answer these on a dedicated FAQ; the
          exact terms matter more than the reassurance. */}
      <section className="mt-12 grid gap-3 sm:grid-cols-3">
        <InfoCard icon={Truck} title="Envío">
          A todo México, entrega en{" "}
          <strong className="text-slate-900">{TIENDA.entregaDias} hábiles</strong>.
          El costo se calcula según tu destino.
        </InfoCard>
        <InfoCard icon={ShieldCheck} title="Garantía">
          <strong className="text-slate-900">{TIENDA.garantiaDias} días</strong>{" "}
          por defecto de fábrica, {TIENDA.garantiaCondicion}.
        </InfoCard>
        <InfoCard icon={MapPin} title="Recoge en tienda">
          {TIENDA.direccion}. {TIENDA.horario}.
        </InfoCard>
      </section>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Truck;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">{children}</p>
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
  const nums: number[] = [];
  const from = Math.max(1, page - 2);
  const to = Math.min(totalPages, from + 4);
  for (let i = Math.max(1, to - 4); i <= to; i++) nums.push(i);

  return (
    <nav aria-label="Paginación" className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
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
          {nums[nums.length - 1] < totalPages - 1 && <span className="px-1 text-slate-400">…</span>}
          <PageBtn onClick={() => onGo(totalPages)}>{totalPages}</PageBtn>
        </>
      )}
      <PageBtn disabled={page >= totalPages} onClick={() => onGo(page + 1)} label="Siguiente">
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

export function ProductCard({
  p,
  whatsapp = null,
}: {
  p: PublicProduct;
  whatsapp?: string | null;
}) {
  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-3 transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-900/5",
        !p.disponible && "opacity-80",
      )}
    >
      {/* Availability badge */}
      <span
        className={cn(
          "absolute left-5 top-5 z-10 rounded-full px-2 py-0.5 text-[10px] font-semibold",
          p.disponible ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500",
        )}
      >
        {p.disponible ? "Disponible" : "Agotado"}
      </span>

      <Link href={`/tienda/${p.id}`} className="flex flex-1 flex-col">
        <div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-white">
          {p.imagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.imagen}
              alt={p.nombre}
              loading="lazy"
              className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 to-slate-50 text-blue-400">
              <Smartphone className="h-9 w-9" />
            </div>
          )}
        </div>
        <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-tight text-slate-900 group-hover:text-blue-800">
          {p.nombre}
        </p>
        {(p.marca || p.categoria) && (
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {[p.marca, p.categoria].filter(Boolean).join(" · ")}
          </p>
        )}
      </Link>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-semibold tabular-nums text-blue-800 [font-family:var(--font-display)]">
          {p.precio_cents > 0 ? formatMXN(p.precio_cents) : "A cotizar"}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <a
            href={waHref(p.nombre, whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Preguntar por ${p.nombre} en WhatsApp`}
            title="Preguntar por WhatsApp"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-green-200 bg-green-50 text-green-700 transition-colors hover:bg-green-100"
          >
            <MessageCircle className="h-4 w-4" />
          </a>
          {/* Priced items only — "A cotizar" has no price to charge. */}
          {p.precio_cents > 0 && (
            <AddToCart
              p={{
                id: p.id,
                nombre: p.nombre,
                precio_cents: p.precio_cents,
                imagen: p.imagen,
                disponible: p.disponible,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
