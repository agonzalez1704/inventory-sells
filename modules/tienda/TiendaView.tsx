"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import { foto } from "@/lib/foto";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useTiendaInfo } from "./TiendaInfoProvider";
import { AddToCart } from "./AddToCart";
import { CompatibleBox } from "./CompatibleBox";
import { logoDeMarca } from "./marca-logo";
import { MARCA } from "@/lib/marca";

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
  const text = encodeURIComponent(`Hola ${MARCA.tienda.nombre}, me interesa: ${nombre}`);
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
  const tienda = useTiendaInfo();
  const [pending, start] = useTransition();
  const [texto, setTexto] = useState(q);

  // The last query we asked the server for.
  //
  // The server echoes q back on every navigation, and adopting it
  // unconditionally overwrites whatever the customer has typed since — the
  // round trip takes long enough on a phone that they are always mid-word. The
  // box then jumps back to an older value under their fingers and the next
  // keystrokes land in the wrong place: typing "Note 10" produced "Note 1p0".
  //
  // So only adopt q when it did NOT come from our own navigation, which leaves
  // exactly the cases where the URL is the authority: back/forward, or a
  // filter chip clearing the search.
  const pedido = useRef(q);

  useEffect(() => {
    if (q === pedido.current) return;
    pedido.current = q;
    setTexto(q);
  }, [q]);

  function go(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    if (!("page" in next)) sp.delete("page");
    if ("q" in next) pedido.current = next.q ?? "";
    // replace, not push, when the query changed: a search-as-you-type that
    // pushes leaves one history entry per pause, so Back from a product walks
    // the customer through every half-typed word instead of leaving the shop.
    const url = `/tienda?${sp.toString()}`;
    start(() =>
      "q" in next
        ? router.replace(url, { scroll: false })
        : router.push(url, { scroll: false }),
    );
  }

  // Debounced search — typing navigates without a submit.
  useEffect(() => {
    if (texto === pedido.current) return;
    const t = setTimeout(() => go({ q: texto || null }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const filtrando = Boolean(q || marca || cat || cal);
  const sinResultados = productos.length === 0;
  // The search box is not counted: the customer can read their own query in it.
  const filtrosActivos = [marca, cat, cal].filter(Boolean).length;
  // Open when a filter is already on, so arriving on a filtered link doesn't
  // look like an unexplained short list.
  const [verFiltros, setVerFiltros] = useState(filtrosActivos > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
      {/* Hero */}
      <section className="relative mt-4 overflow-hidden rounded-3xl bg-gradient-to-br from-tienda-600 via-tienda-700 to-tienda-800 text-white">
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
          <div className="absolute inset-0 bg-gradient-to-r from-tienda-700 from-25% via-tienda-700/70 via-55% to-transparent" />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -left-16 h-80 w-80 rounded-full bg-tienda-400/20 blur-3xl"
        />
        <div
          className={cn(
            "relative px-6 pt-10 sm:px-10 sm:py-14 md:max-w-[52%]",
            filtrando ? "pb-5 sm:pb-14" : "pb-10",
          )}
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-tienda-50">
            <BadgeCheck className="h-3.5 w-3.5" />
            Calidad original y genérica
          </span>
          <h1 className="mt-4 max-w-2xl text-balance text-3xl font-semibold leading-tight tracking-tight [font-family:var(--font-display)] sm:text-5xl">
            La refacción que tu celular necesita
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-sm text-tienda-100 sm:text-base">
            Pantallas, baterías y más — busca por marca y modelo. Precios claros,
            disponibilidad al día.
          </p>

          {/* The one thing no competitor carries — as text, where it converts. */}
          <p className="mt-4 inline-flex items-center gap-2 rounded-xl border border-amber-300/30 dark:border-amber-800 bg-amber-400/15 px-3 py-2 text-xs font-semibold text-amber-100 sm:text-sm">
            <Zap className="h-4 w-4 shrink-0 text-amber-300" />
            Baterías diagnóstico (auto-programables) para iPhone
          </p>

          <div className="mt-6 max-w-xl">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Busca tu modelo (ej: moto g42, redmi note 7…)"
                aria-label="Buscar producto"
                className="h-[3.25rem] w-full rounded-2xl border border-white/10 bg-background py-3.5 pl-11 pr-11 text-base text-foreground shadow-lg shadow-tienda-950/25 outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-tienda-300"
              />
              {pending && (
                <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-tienda-500" />
              )}
            </div>
          </div>

          {/* Quantified promises — competitors state a delivery time instead of
              just "we ship". No free-shipping claim: see lib/tienda-info.ts.
              Hidden on a phone once the customer is searching: they cost ~95px
              directly under the box, which is the space the results need, and
              the same three facts are repeated as cards further down. They stay
              on every wider screen, and on the phone whenever nobody is
              searching — which is when they do their selling. */}
          <div
            className={cn(
              "mt-5 flex-wrap gap-x-5 gap-y-2 text-xs text-tienda-100",
              filtrando ? "hidden sm:flex" : "flex",
            )}
          >
            {/* Each promise renders only if the shop has actually made it. An
                unconfigured business must not advertise "Entrega en" and then
                nothing at all. */}
            {tienda.entregaDias && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> Entrega en {tienda.entregaDias}
              </span>
            )}
            {tienda.garantiaDias != null && (
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" /> {tienda.garantiaDias} días de garantía
              </span>
            )}
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
            <h2 className="text-lg font-semibold tracking-tight text-foreground [font-family:var(--font-display)]">
              Marcas populares
            </h2>
          </div>
          <div className="mt-4 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {marcas.slice(0, 10).map((m) => {
              const logo = logoDeMarca(m.value);
              return (
                <button
                  key={m.value}
                  onClick={() => go({ marca: m.value })}
                  className="group flex w-24 shrink-0 flex-col items-center gap-2"
                >
                  <span className="flex h-20 w-20 items-center justify-center rounded-2xl border border-tienda-100 dark:border-tienda-900 bg-background p-3.5 text-tienda-700 dark:text-tienda-300 shadow-sm transition-all group-hover:-translate-y-0.5 group-hover:border-tienda-300 dark:border-tienda-800 group-hover:shadow-md group-hover:shadow-tienda-900/5">
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element -- static brand asset
                      <img src={logo.src} alt={logo.alt} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-lg font-bold [font-family:var(--font-display)]">
                        {m.value.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="w-full truncate text-center text-xs font-medium text-muted-foreground group-hover:text-tienda-700 dark:text-tienda-300">
                    {m.value}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Catálogo */}
      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight text-foreground [font-family:var(--font-display)]">
            {filtrando ? "Resultados" : "Catálogo"}
          </h2>
          {filtrando && (
            <button
              onClick={() => go({ q: null, marca: null, cat: null, cal: null })}
              className="text-xs font-medium text-tienda-700 dark:text-tienda-300 hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {/* On a phone the filters used to stack ABOVE the grid, so searching
            filled the screen with three rows of chips and pushed the products
            the customer just asked for below the fold. They answer a question
            nobody has yet at that moment — the search box was the question.
            So below lg they collapse behind a button and the results start
            immediately; from lg there is room for both and the aside is a
            sticky rail, unchanged. */}
        <button
          type="button"
          onClick={() => setVerFiltros((v) => !v)}
          aria-expanded={verFiltros}
          className="mt-3 inline-flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-medium lg:hidden"
        >
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            Filtros
            {/* A collapsed panel must never hide that a filter is on: without
                this the customer sees a short result list and no reason why. */}
            {filtrosActivos > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-tienda-600 px-1.5 text-[11px] font-semibold text-white">
                {filtrosActivos}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 text-muted-foreground transition-transform", verFiltros && "rotate-180")}
          />
        </button>

        <div className="mt-3 lg:grid lg:grid-cols-[220px_1fr] lg:gap-8">
          <aside
            className={cn(
              "mb-4 space-y-4 lg:mb-0 lg:block lg:sticky lg:top-4 lg:self-start",
              verFiltros ? "block" : "hidden",
            )}
          >
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
          </aside>

          <div className="min-w-0">
            {sinResultados ? (
              <div className="mt-2">
                <div className="flex flex-col items-center text-center text-muted-foreground">
                  <PackageSearch className="h-10 w-10 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium text-foreground">
                    Sin resultados{q ? ` para “${q}”` : ""}
                  </p>
                  <p className="text-sm">Prueba con otra marca o modelo.</p>
                </div>
                {q && <CompatibleBox query={q} whatsapp={whatsapp} />}
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {total} {total === 1 ? "producto" : "productos"}
                  {q ? ` para “${q}”` : ""}
                  {marca ? ` · ${marca}` : ""}
                </p>
                <div
                  className={cn(
                    "mt-3 grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3",
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
          </div>
        </div>
      </section>

      {/* Objection killers — competitors answer these on a dedicated FAQ; the
          exact terms matter more than the reassurance. */}
      <section className="mt-12 grid gap-3 sm:grid-cols-3">
        <InfoCard icon={Truck} title="Envío">
          A todo México
          {tienda.entregaDias ? (
            <>
              , entrega en{" "}
              <strong className="text-foreground">{tienda.entregaDias} hábiles</strong>
            </>
          ) : null}
          . El costo se calcula según tu destino.
        </InfoCard>
        {tienda.garantiaDias != null && (
          <InfoCard icon={ShieldCheck} title="Garantía">
            <strong className="text-foreground">{tienda.garantiaDias} días</strong>{" "}
            por defecto de fábrica
            {tienda.garantiaCondicion ? `, ${tienda.garantiaCondicion}` : ""}.
          </InfoCard>
        )}
        {tienda.direccion && (
          <InfoCard icon={MapPin} title="Recoge en tienda">
            {tienda.direccion}
            {tienda.horario ? `. ${tienda.horario}` : ""}.
          </InfoCard>
        )}
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
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-tienda-50 dark:bg-tienda-950/40 text-tienda-700 dark:text-tienda-300">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{children}</p>
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
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1.5">
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
          {nums[0] > 2 && <span className="px-1 text-muted-foreground">…</span>}
        </>
      )}
      {nums.map((n) => (
        <PageBtn key={n} active={n === page} onClick={() => onGo(n)}>
          {n}
        </PageBtn>
      ))}
      {nums[nums.length - 1] < totalPages && (
        <>
          {nums[nums.length - 1] < totalPages - 1 && <span className="px-1 text-muted-foreground">…</span>}
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
          ? "bg-tienda-600 text-white shadow-sm shadow-tienda-600/30"
          : "border border-border bg-background text-muted-foreground hover:border-tienda-200 dark:border-tienda-900 hover:text-tienda-700 dark:text-tienda-300",
        disabled && "cursor-not-allowed opacity-40 hover:border-border hover:text-muted-foreground",
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
          ? "bg-tienda-600 text-white shadow-sm shadow-tienda-600/30"
          : "border border-tienda-100 dark:border-tienda-900 bg-background text-muted-foreground hover:border-tienda-200 dark:border-tienda-900 hover:text-tienda-700 dark:text-tienda-300",
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
        "group relative flex flex-col rounded-2xl border border-border bg-background p-3 transition-all hover:-translate-y-0.5 hover:border-tienda-300 dark:border-tienda-800 hover:shadow-lg hover:shadow-tienda-900/5",
        !p.disponible && "opacity-80",
      )}
    >
      {/* Availability badge */}
      <span
        className={cn(
          "absolute left-5 top-5 z-10 rounded-full px-2 py-0.5 text-[10px] font-semibold",
          p.disponible ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300" : "bg-muted text-muted-foreground",
        )}
      >
        {p.disponible ? "Disponible" : "Agotado"}
      </span>

      <Link href={`/tienda/${p.id}`} className="flex flex-1 flex-col">
        <div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-background">
          {p.imagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={foto(p.imagen, 384)}
              alt={p.nombre}
              loading="lazy"
              className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-tienda-50 to-slate-50 text-tienda-400">
              <Smartphone className="h-9 w-9" />
            </div>
          )}
        </div>
        <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-tight text-foreground group-hover:text-tienda-800 dark:text-tienda-300">
          {p.nombre}
        </p>
        {(p.marca || p.categoria) && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[p.marca, p.categoria].filter(Boolean).join(" · ")}
          </p>
        )}
      </Link>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-semibold tabular-nums text-tienda-800 dark:text-tienda-300 [font-family:var(--font-display)]">
          {p.precio_cents > 0 ? formatMXN(p.precio_cents) : "A cotizar"}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Only where there is nothing to buy. Sitting next to the add
              button on a priced card, this was an escape hatch out of a
              purchase the customer had already decided on — and a conversation
              always beats a form. On "A cotizar" it is the only way forward,
              so it stays. */}
          {p.precio_cents <= 0 && (
            <a
              href={waHref(p.nombre, whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Preguntar por ${p.nombre} en WhatsApp`}
              title="Preguntar por WhatsApp"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 transition-colors hover:bg-green-100 dark:bg-green-900/40"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
          )}
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
