"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Smartphone,
  PackageSearch,
  ShieldCheck,
  Truck,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Loader2,
  MapPin,
  X,
} from "lucide-react";
import { foto } from "@/lib/foto";
import { formatPrecio } from "@/lib/money";
import { type ModeloTienda } from "@/lib/calidades";
import { cn } from "@/lib/utils";
import { useTiendaInfo } from "./TiendaInfoProvider";
import { AddToCart } from "./AddToCart";
import { CompatibleBox } from "./CompatibleBox";
import { BarraPedido } from "./CartDrawer";
import { logoDeMarca } from "./marca-logo";
import { MARCA } from "@/lib/marca";
import { BarraFiltros, ChipsActivos, HojaFiltros, PanelFiltros } from "./FiltrosTienda";
import { cuantosFiltros, SIN_FILTROS, urlTienda, type Facetas, type Filtros } from "./filtros";

export type { Facet } from "./filtros";

export type PublicProduct = {
  id: string;
  nombre: string;
  marca: string | null;
  categoria: string | null;
  precio_cents: number;
  disponible: boolean;
  imagen: string | null;
};

const ES_RULI = MARCA.id === "ruli";

function waTexto(texto: string, whatsapp: string | null) {
  const t = encodeURIComponent(texto);
  return whatsapp ? `https://wa.me/${whatsapp}?text=${t}` : `https://wa.me/?text=${t}`;
}

function waHref(nombre: string, whatsapp: string | null) {
  return waTexto(`Hola ${MARCA.tienda.nombre}, me interesa: ${nombre}`, whatsapp);
}

// Ruli lists parts one by one; Lead Displays lists phone models.
const unidad = (n: number) =>
  ES_RULI ? (n === 1 ? "pieza" : "piezas") : n === 1 ? "modelo" : "modelos";

export function TiendaView({
  modelos,
  facetas,
  filtros,
  q,
  page,
  totalPages,
  total,
  whatsapp,
}: {
  modelos: ModeloTienda[];
  facetas: Facetas;
  filtros: Filtros;
  q: string;
  page: number;
  totalPages: number;
  total: number;
  whatsapp: string | null;
}) {
  const router = useRouter();
  const tienda = useTiendaInfo();
  const [pending, start] = useTransition();
  const [texto, setTexto] = useState(q);
  const [hoja, setHoja] = useState(false);
  const cerrarHoja = useCallback(() => setHoja(false), []);

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

  function navegar(url: string, reemplazar: boolean) {
    start(() =>
      reemplazar ? router.replace(url, { scroll: false }) : router.push(url, { scroll: false }),
    );
  }

  // replace, not push, when the query changed: a search-as-you-type that
  // pushes leaves one history entry per pause, so Back from a product walks
  // the customer through every half-typed word instead of leaving the shop.
  function buscar(nuevo: string) {
    pedido.current = nuevo;
    navegar(urlTienda(filtros, nuevo), true);
  }

  // Filters and pages push: Back undoes the last filter, which is what a
  // customer expects after tapping one by mistake. Any filter change starts
  // over at page 1.
  function aplicar(f: Filtros) {
    navegar(urlTienda(f, q), false);
  }

  function irAPagina(n: number) {
    const url = urlTienda(filtros, q);
    navegar(`${url}${url.includes("?") ? "&" : "?"}page=${n}`, false);
    window.scrollTo({ top: 0 });
  }

  // Debounced search — typing navigates without a submit.
  useEffect(() => {
    if (texto === pedido.current) return;
    const t = setTimeout(() => buscar(texto), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  const filtrosActivos = cuantosFiltros(filtros);
  const filtrando = Boolean(q) || filtrosActivos > 0;
  const sinResultados = modelos.length === 0;
  const marcas = [...facetas.marca].sort((a, b) => b.n - a.n);

  return (
    // Bottom padding leaves room for the fixed order bar on phones.
    <div className="mx-auto max-w-6xl px-4 pb-28 sm:px-6 lg:pb-8">
      <h1 className="sr-only">{MARCA.tienda.nombre} — {ES_RULI ? "refacciones" : "pantallas y refacciones"}</h1>

      {/* The approved redesign drops the hero: on a phone it cost the whole
          first screen before a single product. Search and filters are the
          page's first question, so they stick under the header while the list
          scrolls. */}
      <div className="sticky top-16 z-20 -mx-4 border-b border-border/60 bg-[#f5f8ff]/95 px-4 pb-2 pt-3 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pt-6 lg:backdrop-blur-none">
        <div className="relative lg:max-w-2xl">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            enterKeyHint="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={
              ES_RULI
                ? "Busca la pieza: amortiguador, balatas…"
                : "Busca tu modelo: iPhone 11, Moto G31…"
            }
            aria-label="Buscar"
            // 16px text: anything smaller makes iOS zoom the page on focus.
            className="h-12 w-full rounded-xl border border-border bg-background pl-11 pr-12 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-tienda-500 focus:ring-4 focus:ring-tienda-100 [&::-webkit-search-cancel-button]:hidden"
          />
          {pending ? (
            <Loader2 className="absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-tienda-500" />
          ) : (
            texto && (
              <button
                type="button"
                onClick={() => setTexto("")}
                aria-label="Borrar búsqueda"
                className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center text-muted-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            )
          )}
        </div>
        <div className="mt-2">
          <BarraFiltros
            facetas={facetas}
            filtros={filtros}
            onCambio={aplicar}
            onAbrir={() => setHoja(true)}
          />
        </div>
      </div>

      {/* Brands as a way in — only on the untouched catalog. */}
      {!filtrando && marcas.length > 1 && (
        <section className="mt-4">
          <h2 className="text-sm font-semibold text-foreground">Marcas</h2>
          <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
            {marcas.slice(0, 10).map((m) => {
              const logo = logoDeMarca(m.value);
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => aplicar({ ...SIN_FILTROS, marca: [m.value] })}
                  className="flex h-16 w-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-border bg-background p-2 transition-colors hover:border-tienda-300"
                >
                  {logo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- static brand asset
                    <img src={logo.src} alt={logo.alt} className="max-h-7 max-w-full object-contain" />
                  ) : (
                    <span className="text-sm font-bold text-tienda-700">{m.value.slice(0, 2).toUpperCase()}</span>
                  )}
                  <span className="w-full truncate text-center text-[11px] text-muted-foreground">{m.value}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <HojaFiltros
        abierta={hoja}
        onCerrar={cerrarHoja}
        onLimpiar={() => aplicar(SIN_FILTROS)}
        pending={pending}
        pie={`Ver ${total} ${unidad(total)}`}
      >
        <PanelFiltros facetas={facetas} filtros={filtros} onCambio={aplicar} />
      </HojaFiltros>

      <div className="mt-4 lg:grid lg:grid-cols-[240px_1fr] lg:gap-8">
        <aside className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <PanelFiltros facetas={facetas} filtros={filtros} onCambio={aplicar} />
        </aside>

        <div className="min-w-0">
          <div className="flex min-h-11 items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {sinResultados ? "" : `${total} ${unidad(total)}`}
              {!sinResultados && q ? ` para “${q}”` : ""}
            </p>
            {filtrando && (
              <button
                type="button"
                onClick={() => {
                  pedido.current = "";
                  setTexto("");
                  navegar("/tienda", false);
                }}
                className="h-11 cursor-pointer text-sm font-medium text-tienda-700 hover:underline"
              >
                Limpiar
              </button>
            )}
          </div>
          <div className="hidden lg:block">
            <ChipsActivos filtros={filtros} onCambio={aplicar} />
          </div>

          {sinResultados ? (
            <div className="mt-4">
              <div className="flex flex-col items-center text-center text-muted-foreground">
                <PackageSearch className="h-10 w-10" />
                <p className="mt-3 text-sm font-medium text-foreground">
                  Sin resultados{q ? ` para “${q}”` : ""}
                </p>
                <p className="text-sm">
                  {filtrosActivos > 0 ? "Prueba quitando algún filtro." : "Prueba con otra marca o modelo."}
                </p>
              </div>
              {q && <CompatibleBox query={q} whatsapp={whatsapp} />}
              <AyudaWhatsApp whatsapp={whatsapp} />
            </div>
          ) : (
            <>
              {/* Phone: one grouped list, a row per model. Desktop: a grid. */}
              <ul
                className={cn(
                  "mt-1 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background transition-opacity lg:mt-3 lg:grid lg:grid-cols-3 lg:gap-3 lg:divide-y-0 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent xl:grid-cols-4",
                  pending && "opacity-60",
                )}
              >
                {modelos.map((m) => (
                  <li key={`${m.brand}|${m.category}|${m.modelo}`}>
                    <ModeloCard m={m} />
                  </li>
                ))}
              </ul>

              <Pagination page={page} totalPages={totalPages} onGo={irAPagina} />
              <AyudaWhatsApp whatsapp={whatsapp} />
            </>
          )}
        </div>
      </div>

      {/* Objection killers — the exact terms matter more than the reassurance. */}
      <section className="mt-10 grid gap-3 sm:grid-cols-3">
        <InfoCard icon={Truck} title="Envío">
          A todo México
          {tienda.entregaDias ? (
            <>
              , entrega en <strong className="text-foreground">{tienda.entregaDias} hábiles</strong>
            </>
          ) : null}
          . El costo se calcula según tu destino.
        </InfoCard>
        {tienda.garantiaDias != null && (
          <InfoCard icon={ShieldCheck} title="Garantía">
            <strong className="text-foreground">{tienda.garantiaDias} días</strong> por defecto de fábrica
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

      <BarraPedido />
    </div>
  );
}

function AyudaWhatsApp({ whatsapp }: { whatsapp: string | null }) {
  return (
    <div className="mt-4 rounded-2xl border border-border bg-background p-4 lg:flex lg:items-center lg:justify-between lg:gap-4">
      <div>
        <p className="text-[15px] font-semibold text-foreground">
          {ES_RULI ? "¿No encuentras la pieza?" : "¿No aparece tu modelo?"}
        </p>
        <p className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
          {ES_RULI
            ? "Mándanos foto de la pieza vieja o el número de parte y te decimos cuál le queda."
            : "Mándanos una foto de la pieza por WhatsApp y te decimos cuál le queda."}
        </p>
      </div>
      <a
        href={waTexto(`Hola ${MARCA.tienda.nombre}, busco una pieza que no encuentro en la tienda`, whatsapp)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 flex h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted lg:mt-0 lg:shrink-0"
      >
        <MessageCircle className="h-4 w-4 text-green-600" />
        Preguntar por WhatsApp
      </a>
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
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-tienda-50 text-tienda-700 dark:bg-tienda-950/40 dark:text-tienda-300">
          <Icon className="h-4 w-4" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{children}</p>
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
    <nav aria-label="Paginación" className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
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
        "flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl px-3 text-sm font-medium transition-colors",
        active
          ? "bg-tienda-600 text-white shadow-sm shadow-tienda-600/30"
          : "border border-border bg-background text-muted-foreground hover:border-tienda-200 hover:text-tienda-700",
        disabled && "cursor-not-allowed opacity-40 hover:border-border hover:text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * One model, one row: photo, brand, model, how many qualities, the entry price
 * and whether it can be had. The qualities themselves are chosen on the model
 * page — three price rows inside every card made the phone list unreadable
 * (the user's call, 2026-09-15). On desktop the same element is a grid card.
 */
export function ModeloCard({ m }: { m: ModeloTienda }) {
  const disponibles = m.variantes.filter((v) => v.disponible);
  const locales = disponibles.filter((v) => !(v.entrega_dias ?? 0));
  // Variants arrive cheapest first: open the cheapest one that can be sold.
  const destino = disponibles[0] ?? m.variantes[0];
  const n = m.variantes.length;
  const tipo = m.category ? m.category[0].toUpperCase() + m.category.slice(1) : null;
  const titulo = [m.brand, m.modelo].filter(Boolean).join(" ");
  const dias = disponibles.length ? Math.min(...disponibles.map((v) => v.entrega_dias ?? 0)) : 0;

  return (
    <Link
      prefetch={true}
      href={`/tienda/${destino.id}`}
      aria-label={`Ver ${titulo}`}
      className={cn(
        "flex items-center gap-3 p-3 transition-colors active:bg-muted/60 lg:h-full lg:flex-col lg:items-stretch lg:gap-0 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-background lg:p-0 lg:hover:border-tienda-300",
        disponibles.length === 0 && "opacity-70",
      )}
    >
      <span className="flex h-[68px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-muted/50 lg:aspect-[4/3] lg:h-auto lg:w-full lg:rounded-none">
        {m.imagen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto(m.imagen, 384)} alt={titulo} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <Smartphone className="h-7 w-7 text-muted-foreground/40" />
        )}
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5 lg:px-3 lg:pt-3">
        {m.brand && (
          <span className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {m.brand}
          </span>
        )}
        <span className="line-clamp-2 text-base font-semibold leading-snug tracking-tight text-foreground">
          {m.modelo}
        </span>
        <span className="truncate text-[13px] text-muted-foreground">
          {/* "Calidades" is phone-shop language: Ruli's grouped rows are
              variants of one part, not quality tiers. */}
          {[tipo, n > 1 ? `${n} ${ES_RULI ? "opciones" : "calidades"}` : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>

      <span className="flex shrink-0 flex-col items-end gap-1 lg:flex-row lg:items-center lg:justify-between lg:px-3 lg:pb-3 lg:pt-2">
        <span className="text-right leading-tight">
          {n > 1 && m.desde_cents ? (
            <span className="block text-[11px] text-muted-foreground lg:mr-1 lg:inline">desde</span>
          ) : null}
          <span className="text-[17px] font-semibold tabular-nums text-foreground">
            {m.desde_cents ? formatPrecio(m.desde_cents) : "A cotizar"}
          </span>
        </span>
        <span
          className={cn(
            "flex items-center gap-1.5 text-[11px]",
            locales.length ? "text-green-700" : disponibles.length ? "text-amber-700" : "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              locales.length ? "bg-green-600" : disponibles.length ? "bg-amber-500" : "bg-muted-foreground/50",
            )}
          />
          {locales.length ? "En existencia" : disponibles.length ? `Llega en +${dias} días` : "Agotado"}
        </span>
      </span>
    </Link>
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
        "group relative flex flex-col rounded-2xl border border-border bg-background p-3 transition-all hover:-translate-y-0.5 hover:border-tienda-300 hover:shadow-lg hover:shadow-tienda-900/5",
        !p.disponible && "opacity-80",
      )}
    >
      <span
        className={cn(
          "absolute left-5 top-5 z-10 rounded-full px-2 py-0.5 text-[10px] font-semibold",
          p.disponible ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-muted text-muted-foreground",
        )}
      >
        {p.disponible ? "Disponible" : "Agotado"}
      </span>

      <Link prefetch={true} href={`/tienda/${p.id}`} className="flex flex-1 flex-col">
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
        <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-tight text-foreground group-hover:text-tienda-800">
          {p.nombre}
        </p>
        {(p.marca || p.categoria) && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[p.marca, p.categoria].filter(Boolean).join(" · ")}
          </p>
        )}
      </Link>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="font-semibold tabular-nums text-tienda-800 dark:text-tienda-300">
          {p.precio_cents > 0 ? formatPrecio(p.precio_cents) : "A cotizar"}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Only where there is nothing to buy: on "A cotizar" a conversation
              is the only way forward. */}
          {p.precio_cents <= 0 && (
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
          )}
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
