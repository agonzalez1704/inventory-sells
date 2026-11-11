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
  ChevronDown,
  MessageCircle,
  Loader2,
  MapPin,
  X,
  CarFront,
  Store,
  Warehouse,
  Plus,
  Minus,
  Trash2,
} from "lucide-react";
import { foto } from "@/lib/foto";
import { formatPrecio } from "@/lib/money";
import { type ModeloTienda, type VarianteModelo } from "@/lib/calidades";
import { cn } from "@/lib/utils";
import { useTiendaInfo } from "./TiendaInfoProvider";
import { puntosRecoger } from "@/lib/tienda-info";
import { AddToCart, MAX_POR_PRODUCTO } from "./AddToCart";
import { useCart } from "./CartProvider";
import { CompatibleBox } from "./CompatibleBox";
import { BarraPedido } from "./CartDrawer";
import { logoDeMarca } from "./marca-logo";
import { MARCA } from "@/lib/marca";
import { BarraFiltros, BarraVehiculo, ChipsActivos, HojaFiltros, PanelFiltros } from "./FiltrosTienda";
import { BuscadorTienda } from "./BuscadorTienda";
import { RielPedido } from "./RielPedido";
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

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

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
  totalSinFiltros = null,
  compat = null,
}: {
  modelos: ModeloTienda[];
  facetas: Facetas;
  filtros: Filtros;
  q: string;
  page: number;
  totalPages: number;
  total: number;
  whatsapp: string | null;
  /** Search only: how many models the query finds with no filters on. */
  totalSinFiltros?: number | null;
  /** Vehicle chosen: what each listed product fits, by product id. */
  compat?: Record<string, string> | null;
}) {
  const router = useRouter();
  const tienda = useTiendaInfo();
  const [pending, start] = useTransition();
  const [hoja, setHoja] = useState(false);
  // The phone search overlay lives inside the sticky bar: lift the bar above
  // the site header while it is open.
  const [buscando, setBuscando] = useState(false);
  const cerrarHoja = useCallback(() => setHoja(false), []);

  function navegar(url: string, reemplazar: boolean) {
    start(() =>
      reemplazar ? router.replace(url, { scroll: false }) : router.push(url, { scroll: false }),
    );
  }

  // A committed search starts from a clean slate — the suggestion counts it
  // was chosen from ("Ver los 3 modelos", "“a31” en Pantallas") ignore the
  // filters that were on. Pushed: Back returns to the previous results.
  function enviarBusqueda(nuevo: string, cat?: string) {
    navegar(urlTienda(cat ? { ...SIN_FILTROS, cat: [cat] } : SIN_FILTROS, nuevo), false);
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

  const filtrosActivos = cuantosFiltros(filtros);
  const filtrando = Boolean(q) || filtrosActivos > 0;
  const sinResultados = modelos.length === 0;
  const marcas = [...facetas.marca].sort((a, b) => b.n - a.n);
  const tipos = facetas.cat
    .filter((c) => c.n > 0 || filtros.cat.includes(c.value))
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);

  // The search found more than the filters let through: say so, with the way
  // out, instead of a short list that looks like all there is.
  const ocultos = totalSinFiltros != null ? totalSinFiltros - total : 0;
  const avisoOcultos =
    q && filtrosActivos > 0 && ocultos > 0 ? (
      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/30">
        <p className="text-[15px] font-semibold text-foreground">
          Tus filtros ocultan {ocultos} {unidad(ocultos)}
        </p>
        <p className="mt-1 text-pretty text-sm text-muted-foreground">
          También coinciden con “{q}”, pero no pasan los filtros que tienes activos.
        </p>
        <button
          type="button"
          onClick={() => aplicar(SIN_FILTROS)}
          className="mt-3 h-11 cursor-pointer rounded-xl bg-tienda-600 px-4 text-sm font-semibold text-white hover:bg-tienda-700"
        >
          Ver {totalSinFiltros === 1 ? `el ${unidad(1)}` : `los ${totalSinFiltros} ${unidad(totalSinFiltros ?? 0)}`}
        </button>
      </div>
    ) : null;

  return (
    // Bottom padding leaves room for the fixed order bar on phones.
    <div className="mx-auto max-w-6xl px-4 pb-28 sm:px-6 lg:pb-8 xl:max-w-7xl">
      <h1 className="sr-only">{MARCA.tienda.nombre} — {ES_RULI ? "refacciones" : "pantallas y refacciones"}</h1>

      {/* The approved redesign drops the hero: on a phone it cost the whole
          first screen before a single product. Search and filters are the
          page's first question, so they stick under the header while the list
          scrolls. */}
      {/* Solid background, no backdrop-blur-sm: a backdrop filter would become
          the containing block of the fixed search overlay inside and trap it
          in this bar. */}
      <div
        className={cn(
          // Desktop searches from the site header (BuscadorEncabezado).
          "sticky top-16 -mx-4 border-b border-border/60 bg-[#f5f8ff] px-4 pb-2 pt-3 sm:-mx-6 sm:px-6 lg:hidden",
          buscando ? "z-50" : "z-20",
        )}
      >
        <BuscadorTienda
          q={q}
          pending={pending}
          onEnviar={enviarBusqueda}
          onAbierto={setBuscando}
          placeholder={
            ES_RULI ? "Busca la pieza: amortiguador, balatas…" : "Busca tu modelo: iPhone 11, Moto G31…"
          }
        />
        <div className="mt-2">
          <BarraFiltros
            facetas={facetas}
            filtros={filtros}
            onCambio={aplicar}
            onAbrir={() => setHoja(true)}
          />
        </div>
      </div>

      {/* Desktop: part types as tabs, the first cut most customers make. Not on
          Ruli, whose 216 type codes are not tabs anyone can read yet. */}
      {!ES_RULI && tipos.length > 1 && (
        <nav aria-label="Tipo de pieza" className="mt-6 hidden gap-1 border-b border-border lg:flex">
          <Pestana activa={filtros.cat.length === 0} onClick={() => aplicar({ ...filtros, cat: [] })}>
            Todo
          </Pestana>
          {tipos.map((c) => (
            <Pestana
              key={c.value}
              activa={filtros.cat.length === 1 && filtros.cat[0] === c.value}
              onClick={() => aplicar({ ...filtros, cat: [c.value] })}
            >
              {cap(c.value)}
              <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{c.n}</span>
            </Pestana>
          ))}
        </nav>
      )}

      <BarraVehiculo facetas={facetas} filtros={filtros} onCambio={aplicar} />

      {/* Brands as a way in — only on the untouched catalog. */}
      {!filtrando && marcas.length > 1 && (
        <section className="mt-4">
          <h2 className="text-sm font-semibold text-foreground">Marcas</h2>
          <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-none sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
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

      <div className="mt-4 lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[240px_minmax(0,1fr)_280px]">
        <aside className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <PanelFiltros facetas={facetas} filtros={filtros} onCambio={aplicar} vehiculoArriba />
        </aside>

        <div className="min-w-0">
          <div className="flex min-h-11 items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {sinResultados ? "" : `${total} ${unidad(total)}`}
              {!sinResultados && q ? ` para “${q}”` : ""}
              {!sinResultados && filtros.vmarca
                ? ` para ${[filtros.vmarca, filtros.vmodelo, filtros.anio].filter(Boolean).join(" ")}`
                : ""}
            </p>
            <div className="flex items-center gap-4">
              {/* "Ordenar", per the design. A native select: on a phone the
                  system picker is the best one there is. */}
              {!sinResultados && (
                <label className="relative flex h-11 items-center gap-1.5 text-sm">
                  <span className="hidden text-muted-foreground lg:inline">Ordenar:</span>
                  <select
                    value={filtros.orden ?? ""}
                    onChange={(e) => aplicar({ ...filtros, orden: (e.target.value || null) as Filtros["orden"] })}
                    aria-label="Ordenar"
                    className="h-11 cursor-pointer appearance-none bg-transparent pr-5 text-base font-medium text-foreground outline-hidden lg:text-sm"
                  >
                    <option value="">{q ? "Relevancia" : "Recomendados"}</option>
                    <option value="vendidos">Más vendidos</option>
                    <option value="precio_asc">Menor precio</option>
                    <option value="precio_desc">Mayor precio</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-0 h-4 w-4 text-muted-foreground" />
                </label>
              )}
              {filtrando && (
                <button
                  type="button"
                  onClick={() => navegar("/tienda", false)}
                  className="h-11 cursor-pointer text-sm font-medium text-tienda-700 hover:underline"
                >
                  Limpiar
                </button>
              )}
            </div>
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
              {avisoOcultos}
              {q && !avisoOcultos && <CompatibleBox query={q} whatsapp={whatsapp} />}
              <AyudaWhatsApp whatsapp={whatsapp} />
            </div>
          ) : (
            <>
              {/* Phone: one grouped list, a row per model. Desktop: a grid. */}
              <ul
                className={cn(
                  "mt-1 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-background transition-opacity lg:mt-3",
                  // Ruli keeps rows on desktop too: part names are long and the
                  // fit line needs the width.
                  !ES_RULI &&
                    "lg:grid lg:grid-cols-3 lg:gap-3 lg:divide-y-0 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent",
                  pending && "opacity-60",
                )}
              >
                {modelos.map((m) => (
                  <li key={m.variantes[0].id}>
                    <ModeloCard
                      m={m}
                      whatsapp={whatsapp}
                      compat={m.variantes.map((v) => compat?.[v.id]).find(Boolean) ?? null}
                    />
                  </li>
                ))}
              </ul>

              {avisoOcultos}
              <Pagination page={page} totalPages={totalPages} onGo={irAPagina} />
              <AyudaWhatsApp whatsapp={whatsapp} />
            </>
          )}
        </div>

        <aside className="hidden xl:sticky xl:top-20 xl:block xl:self-start">
          <RielPedido />
        </aside>
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

function Pestana({
  activa,
  onClick,
  children,
}: {
  activa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={activa ? "page" : undefined}
      className={cn(
        "-mb-px flex h-11 cursor-pointer items-center border-b-2 px-4 text-sm transition-colors",
        activa
          ? "border-tienda-600 font-medium text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
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
 * One model, one row: photo, then the part with a clear order of reading —
 * what it is (name), whether it fits (car), what it costs and the action.
 * Brand, type and part number are reference, so they sit quieter. The row is
 * one big link (stretched over the title) with the action floating above it,
 * so a part with a single price goes to the order without opening its page;
 * one with several options opens the page to choose. On desktop the non-Ruli
 * shop turns the same element into a grid card.
 */
export function ModeloCard({
  m,
  compat = null,
  whatsapp = null,
}: {
  m: ModeloTienda;
  compat?: string | null;
  whatsapp?: string | null;
}) {
  // Lead Displays turns the row into a grid card on desktop; Ruli stays a row.
  const tarjeta = !ES_RULI;
  const disponibles = m.variantes.filter((v) => v.disponible);
  const locales = disponibles.filter((v) => !(v.entrega_dias ?? 0));
  // Variants arrive cheapest first: open the cheapest one that can be sold.
  const destino = disponibles[0] ?? m.variantes[0];
  const n = m.variantes.length;
  const tipo = m.category ? m.category[0].toUpperCase() + m.category.slice(1) : null;
  const titulo = [m.brand, m.modelo].filter(Boolean).join(" ");
  const dias = disponibles.length ? Math.min(...disponibles.map((v) => v.entrega_dias ?? 0)) : 0;
  const agotado = disponibles.length === 0;
  // Narrow grid card (desktop, phone shop): the action goes full width under
  // the price instead of squeezing it.
  const ancho = tarjeta && "lg:w-full lg:justify-center";
  // Where it is and when the customer has it: the warehouse(s) it can come
  // from, and for stock on hand, pickup today (or the shop's shipping time).
  const tienda = useTiendaInfo();
  const almacenes = [...new Set(disponibles.map((v) => v.almacen).filter(Boolean))] as string[];
  // Ruli: the same part in several warehouses, one priced option each. The
  // card orders straight from the list, one button per warehouse, nearest
  // first — mechanics know the part, opening its page for each was the friction.
  const porAlmacen =
    ES_RULI && n > 1 && almacenes.length === disponibles.length && disponibles.every((v) => v.precio_cents > 0);
  const opciones = porAlmacen ? [...disponibles].sort((a, b) => (a.entrega_dias ?? 0) - (b.entrega_dias ?? 0)) : [];
  const entrega =
    agotado || !locales.length
      ? null
      : puntosRecoger(tienda).length
        ? "listo para recoger hoy"
        : tienda.entregaDias
          ? `envío en ${tienda.entregaDias}`
          : null;

  return (
    <div
      className={cn(
        "group relative flex gap-3.5 p-3.5 transition-colors duration-150 ease-out has-[a:active]:bg-muted/60",
        porAlmacen && "flex-wrap",
        tarjeta
          ? "lg:h-full lg:flex-col lg:gap-0 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-background lg:p-0 lg:hover:border-tienda-300"
          : "hover:bg-muted/40",
      )}
    >
      <span
        className={cn(
          "flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-border",
          agotado && "opacity-60",
          tarjeta && "lg:aspect-4/3 lg:h-auto lg:w-full lg:rounded-none lg:ring-0",
        )}
      >
        {m.imagen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto(m.imagen, 384)} alt="" loading="lazy" className="h-full w-full object-contain p-1" />
        ) : (
          <Smartphone className="h-7 w-7 text-muted-foreground/40" />
        )}
      </span>

      <div className={cn("flex min-w-0 flex-1 flex-col", tarjeta && "lg:p-3")}>
        {(m.brand || tipo) && (
          <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {[m.brand, tipo].filter(Boolean).join(" · ")}
          </p>
        )}
        <Link
          prefetch={true}
          href={`/tienda/${destino.id}`}
          aria-label={`Ver ${titulo}`}
          // Stretched: the whole row opens the part; only the action button
          // (z-10) sits above it.
          className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-tienda-500"
        >
          {m.modelo}
        </Link>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {/* The part number is what a mechanic matches; the phone shop's sku is
              an internal slug, so it stays off the card. */}
          {ES_RULI && destino.sku && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">
              {destino.sku}
            </span>
          )}
          {n > 1 && !porAlmacen && (
            <span className="text-xs text-muted-foreground">
              {n} {ES_RULI ? "opciones" : "calidades"}
            </span>
          )}
        </div>

        {compat && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[13px] font-medium leading-snug text-tienda-800 dark:text-tienda-300">
            <CarFront aria-hidden className="mt-px h-4 w-4 shrink-0 text-tienda-600" />
            <span className="line-clamp-2">Le queda a {compat}</span>
          </p>
        )}

        {!porAlmacen && (almacenes.length > 0 || entrega) && (
          <p className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-snug text-muted-foreground">
            {almacenes.length ? (
              <Warehouse aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <Store aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            <span className="line-clamp-2">
              {almacenes.length > 0 && (
                <span className="font-medium text-foreground">{almacenes.join(" y ")}</span>
              )}
              {almacenes.length > 0 && entrega && " · "}
              {entrega && (almacenes.length ? entrega : entrega[0].toUpperCase() + entrega.slice(1))}
            </span>
          </p>
        )}

        {!porAlmacen && (
        <div className={cn("mt-auto flex items-end justify-between gap-3 pt-3", tarjeta && "lg:flex-col lg:items-stretch lg:gap-2.5")}>
          <div className="min-w-0 leading-tight">
            {m.desde_cents ? (
              <p className="text-lg font-bold tabular-nums tracking-tight text-foreground">
                {n > 1 && <span className="mr-1 text-xs font-medium text-muted-foreground">desde</span>}
                {formatPrecio(m.desde_cents)}
              </p>
            ) : (
              <p className="text-[15px] font-semibold text-muted-foreground">A cotizar</p>
            )}
            <p
              className={cn(
                "mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-xs font-medium",
                locales.length ? "text-green-700" : disponibles.length ? "text-amber-700" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  locales.length ? "bg-green-600" : disponibles.length ? "bg-amber-500" : "bg-muted-foreground/50",
                )}
              />
              {locales.length ? "En existencia" : disponibles.length ? `Llega en +${dias} días hábiles` : "Agotado"}
            </p>
          </div>

          {!agotado &&
            (n > 1 ? (
              // Part of the row link (no z-10): choosing happens on its page.
              <span className={cn("flex h-10 shrink-0 items-center gap-1 rounded-xl px-3.5 text-sm font-semibold text-tienda-700 ring-1 ring-tienda-200 transition-colors group-hover:bg-tienda-50", ancho)}>
                Elegir
                <ChevronRight className="h-4 w-4" />
              </span>
            ) : destino.precio_cents > 0 ? (
              <AddToCart
                size="md"
                abrir={false}
                className={cn("relative z-10 shrink-0", ancho)}
                p={{
                  id: destino.id,
                  nombre: destino.nombre,
                  precio_cents: destino.precio_cents,
                  imagen: destino.imagen ?? m.imagen,
                  disponible: true,
                  tope: destino.tope,
                }}
              />
            ) : (
              <a
                href={waHref(`${destino.nombre}${destino.sku ? ` (No. de parte ${destino.sku})` : ""}`, whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn("relative z-10 flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-green-50 px-3.5 text-sm font-semibold text-green-700 ring-1 ring-green-200 transition-[background-color,transform] duration-150 ease-out hover:bg-green-100 active:scale-[0.97]", ancho)}
              >
                <MessageCircle className="h-4 w-4" />
                Cotizar
              </a>
            ))}
        </div>
        )}
      </div>

      {porAlmacen && (
        // Full card width, under the photo. The nearest warehouse (Mostrador)
        // is the big button — it's what mechanics almost always want; the
        // others sit under it, smaller.
        <div className="relative z-10 flex basis-full flex-col gap-2">
          {opciones.map((v, i) => (
            <OpcionAlmacen key={v.id} v={v} imagen={v.imagen ?? m.imagen} principal={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One warehouse's option on a listing card. The main one is a full-width
 * "Agregar · Mostrador  $248"; the rest are a quiet "o pedirlo de …" line.
 * Once in the order either becomes its own − qty + control. Adding never opens
 * the cart: the next part is the next tap.
 */
function OpcionAlmacen({ v, imagen, principal }: { v: VarianteModelo; imagen: string | null; principal: boolean }) {
  const { add, items, setQty } = useCart();
  const qty = items.find((i) => i.id === v.id)?.qty ?? 0;
  const tope = v.tope ?? MAX_POR_PRODUCTO;
  const dias = v.entrega_dias ? ` · +${v.entrega_dias} días` : "";
  const precio = formatPrecio(v.precio_cents);
  const agregar = () =>
    add({ id: v.id, nombre: v.nombre, precio_cents: v.precio_cents, imagen, max: tope, almacen: v.almacen }, 1, false);
  const presion = "cursor-pointer transition-[background-color,transform] duration-150 ease-out active:scale-[0.97]";

  if (qty > 0) {
    const boton = cn(
      "flex shrink-0 cursor-pointer items-center justify-center disabled:cursor-not-allowed disabled:opacity-30",
      principal ? "h-11 w-11" : "h-9 w-9",
    );
    const icono = principal ? "h-4 w-4" : "h-3.5 w-3.5";
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-xl bg-tienda-50 pl-3 text-tienda-800 ring-1 ring-tienda-200 dark:bg-tienda-950/40 dark:text-tienda-200 dark:ring-tienda-800",
          principal ? "h-11 text-sm" : "h-9 text-[13px]",
        )}
      >
        <span className="min-w-0 truncate font-semibold">
          {v.almacen} · <span className="tabular-nums">{precio}</span>
          {qty >= tope ? " · ya no hay más" : dias}
        </span>
        <span className="flex items-center">
          <button type="button" onClick={() => setQty(v.id, qty - 1)} aria-label={qty === 1 ? `Quitar ${v.nombre}` : "Quitar uno"} className={boton}>
            {qty === 1 ? <Trash2 className={icono} /> : <Minus className={icono} />}
          </button>
          <span className="min-w-5 text-center font-bold tabular-nums">{qty}</span>
          <button type="button" onClick={() => setQty(v.id, qty + 1)} disabled={qty >= tope} aria-label="Agregar uno" className={boton}>
            <Plus className={icono} />
          </button>
        </span>
      </div>
    );
  }

  return principal ? (
    <button
      type="button"
      onClick={agregar}
      aria-label={`Agregar ${v.nombre} de ${v.almacen}`}
      className={cn(
        "flex h-11 w-full items-center justify-between gap-3 rounded-xl bg-tienda-600 px-3.5 text-sm font-semibold text-white shadow-sm shadow-tienda-600/30 hover:bg-tienda-700",
        presion,
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Plus className="h-4 w-4 shrink-0" />
        <span className="truncate">
          Agregar · {v.almacen}
          {dias}
        </span>
      </span>
      <span className="shrink-0 tabular-nums">{precio}</span>
    </button>
  ) : (
    <button
      type="button"
      onClick={agregar}
      aria-label={`Agregar ${v.nombre} de ${v.almacen}`}
      className={cn(
        "flex h-9 w-full items-center justify-between gap-3 rounded-[10px] px-3 text-[13px] text-muted-foreground ring-1 ring-border hover:bg-muted",
        presion,
      )}
    >
      <span className="truncate">
        o pedirlo de {v.almacen}
        {dias}
      </span>
      <span className="flex shrink-0 items-center gap-1 font-semibold tabular-nums text-foreground">
        {precio}
        <Plus className="h-3.5 w-3.5" />
      </span>
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
        <div className="relative mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-linear-to-b from-white via-white to-slate-200">
          {p.imagen ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={foto(p.imagen, 384)}
              alt={p.nombre}
              loading="lazy"
              className="h-full w-full object-cover mix-blend-multiply transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-tienda-50 to-slate-50 text-tienda-400">
              <Smartphone className="h-9 w-9" />
            </div>
          )}
        </div>
        <p className="line-clamp-2 min-h-10 text-sm font-bold leading-tight text-foreground group-hover:text-tienda-800">
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
