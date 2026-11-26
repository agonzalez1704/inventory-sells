import Link from "next/link";
import { Archivo } from "next/font/google";
import { SignInButton } from "@clerk/nextjs";
import { facetasTienda } from "@/modules/tienda/lecturas";
import { leerFacetas, type Facet } from "@/modules/tienda/filtros";
import { getTiendaInfo } from "@/modules/config/lib";
import { prettyPhone, waHref } from "@/lib/wa-tienda";
import { CarroScroll } from "./CarroScroll";
import { BuscarCarro } from "./BuscarCarro";

// Refaccionaria Ruli's home page (refaccionariaruli.com/). Fiable keeps the
// generic one in app/page.tsx. Approved mockup: the "Ruli: propuesta de
// landing" design canvas, 2026-11-25.
//
// Every number on it comes from the storefront's own counts (the same cached
// read /tienda browses with), so the page never promises a system or a brand
// the catalog doesn't have.

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const n = (x: number) => x.toLocaleString("es-MX");
const porCantidad = (a: Facet, b: Facet) => b.n - a.n;
const tienda = (k: string, v: string) => `/tienda?${new URLSearchParams({ [k]: v })}`;

const titulo =
  "m-0 text-[clamp(44px,7vw,72px)] font-black uppercase leading-[0.9] tracking-[-0.02em] [font-stretch:125%]";

// Each system's tile art: a part cut out of the same exploded car as the hero.
const IMAGENES: [RegExp, string][] = [
  [/suspensi/i, "suspension"],
  [/motor/i, "motor"],
  [/colisi|carrocer/i, "colision"],
  [/direcci/i, "direccion"],
  [/fren/i, "frenos"],
  [/enfri|radiad/i, "enfriamiento"],
];
const imagenDe = (sistema: string) => {
  const f = IMAGENES.find(([re]) => re.test(sistema));
  return f ? `/landing/sistemas/${f[1]}.webp` : null;
};

const PASOS = [
  { titulo: "Elige tu carro", texto: "Armadora, modelo y año. Solo ves lo que le queda, con todas las marcas que sirven." },
  { titulo: "Pide en línea", texto: "Paga en la página o pídela por WhatsApp." },
  {
    titulo: "Recoge o te llega",
    texto: "Pasa al mostrador, o te la enviamos a todo México con el costo según tu código postal.",
  },
];

export async function LandingRuli() {
  const [facetas, info] = await Promise.all([
    // Same cache entry as /tienda with no filters. If the counts fail the page
    // still renders, just without numbers.
    facetasTienda({}).then(leerFacetas).catch(() => null),
    getTiendaInfo(),
  ]);
  const whatsapp = process.env.STORE_WHATSAPP ?? null;
  const wa = waHref(whatsapp);

  const tel = prettyPhone(whatsapp);

  const sistemas = [...(facetas?.sis ?? [])].sort(porCantidad);
  // The biggest gets the large tile; four more fill the grid; the rest are chips.
  const enCuadro = sistemas.slice(0, 5);
  const enChip = sistemas.slice(5);
  const marcas = [...(facetas?.marca ?? [])].sort(porCantidad).slice(0, 6);
  const suspension = facetas?.sis.find((s) => /suspensi/i.test(s.value)) ?? null;
  const modelos = (facetas?.vmm ?? []).map((o) => {
    const i = o.value.indexOf("|");
    return { marca: o.value.slice(0, i), modelo: o.value.slice(i + 1), n: o.n };
  });
  // Pieces per make as the catalog counts them; if that facet is missing, the
  // sum of its models (an upper bound: a part can fit two of them).
  const armadoras: Record<string, number> = {};
  if (facetas?.vmarca.length) for (const f of facetas.vmarca) armadoras[f.value] = f.n;
  else for (const m of modelos) armadoras[m.marca] = (armadoras[m.marca] ?? 0) + m.n;

  return (
    <div className={`${archivo.variable} bg-[#0b0b0c] text-[#f2f2f3] [font-family:var(--font-archivo),system-ui,sans-serif]`}>
      <style href="ruli-landing" precedence="default">{`@keyframes ruli-cinta{to{transform:translateX(-50%)}}`}</style>
      <CarroScroll
        encabezado={
          <header className="flex items-center gap-4 px-4 py-5 sm:gap-7 sm:px-12 sm:py-6">
            <Link href="/" aria-label="Refaccionaria Ruli — inicio">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset in public/, sized by height */}
              <img src="/landing/ruli-logo-blanco.webp" alt="Refaccionaria Ruli" width={640} height={320} className="h-8 w-auto sm:h-9" />
            </Link>
            <span className="flex-1" />
            <nav aria-label="Principal" className="flex items-center gap-5 text-[15px] font-medium sm:gap-7">
              <Link href="/tienda" className="hover:text-white">Catálogo</Link>
              <a href="#carro" className="hidden hover:text-white sm:inline">Buscar por carro</a>
              <a href="#comprar" className="hidden hover:text-white sm:inline">Cómo comprar</a>
              {/* Staff land here too: the way in must be on screen, not after the whole page. */}
              <SignInButton mode="modal" forceRedirectUrl="/inicio">
                <button className="cursor-pointer hover:text-white">Entrar</button>
              </SignInButton>
            </nav>
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center rounded-xl border border-white/25 px-4 text-sm font-semibold transition-colors hover:border-white/60"
            >
              WhatsApp
            </a>
          </header>
        }
        inicio={
          <div className="flex flex-col gap-3">
            <h1 className="m-0 text-[clamp(30px,4vw,44px)] font-extrabold leading-[1.05] [font-stretch:110%]">
              Refacciones y autopartes para tu carro
            </h1>
            <p className="m-0 text-[17px] text-[#b4b4b9]">
              {facetas?.total ? `${n(facetas.total)} piezas en catálogo. ` : ""}Desliza y mira todo lo que tenemos adentro.
            </p>
          </div>
        }
        medio={
          <div className="flex flex-col gap-3">
            <h2 className="m-0 text-[clamp(30px,4vw,44px)] font-extrabold leading-[1.05] [font-stretch:110%]">
              Cada pieza de tu carro, en un solo lugar
            </h2>
            <p className="m-0 text-[17px] text-[#b4b4b9]">
              {sistemas.length ? sistemas.map((s) => s.value).join(", ") : "Suspensión, frenos, motor y más"}.
            </p>
          </div>
        }
        final={
          <div className="flex flex-col gap-3.5">
            <span className="text-[15px] font-semibold text-[#ff5a63]">Suspensión</span>
            <h2 className="m-0 text-[clamp(34px,9vw,52px)] font-black leading-none [font-stretch:115%]">Amortiguadores</h2>
            <p className="m-0 text-[17px] text-[#b4b4b9]">
              {suspension ? `${n(suspension.n)} piezas de suspensión, ` : "Toda la suspensión, "}
              con las marcas que le quedan a tu carro y su precio.
            </p>
            <Link
              href={suspension ? tienda("sis", suspension.value) : "/tienda"}
              className="inline-flex h-[52px] items-center self-start rounded-2xl bg-[#d71f2a] px-6 text-base font-bold text-white transition-transform duration-150 hover:bg-[#bd1a24] active:scale-[0.97]"
            >
              Ver suspensión
            </Link>
          </div>
        }
      />

      <section id="carro" className="relative scroll-mt-4 overflow-hidden border-t border-white/[0.06] px-4 py-20 sm:px-12 sm:py-28">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-48 -top-32 size-[760px] rounded-full bg-[radial-gradient(circle,rgba(215,31,42,0.22),transparent_65%)]"
        />
        <BuscarCarro modelos={modelos} armadoras={armadoras} total={facetas?.total ?? 0} />
      </section>

      {sistemas.length > 0 && (
        <section id="sistemas" className="px-4 py-20 sm:px-12 sm:py-28">
          <div className="mx-auto flex max-w-[1240px] flex-col gap-8 sm:gap-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className={titulo}>
                Busca por
                <br />
                sistema
              </h2>
              <p className="m-0 max-w-[340px] text-base leading-relaxed text-[#8d8d93]">
                Lo que hay hoy en el catálogo, por sistema. El número se actualiza solo.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:grid-rows-[300px_300px]">
              {enCuadro.map((s, i) => {
                const grande = i === 0;
                const img = imagenDe(s.value);
                return (
                  <Link
                    key={s.value}
                    href={tienda("sis", s.value)}
                    className={`group relative flex flex-col justify-between overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#141416] p-5 transition-colors duration-200 hover:border-[#d71f2a]/70 sm:p-6 ${
                      grande ? "col-span-2 min-h-[320px] sm:min-h-[420px] lg:row-span-2 lg:min-h-0" : "min-h-[200px] lg:min-h-0"
                    }`}
                  >
                    {img && (
                      // eslint-disable-next-line @next/next/no-img-element -- small static crop in public/, decorative
                      <img
                        src={img}
                        alt=""
                        loading="lazy"
                        className={`pointer-events-none absolute mix-blend-lighten transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:scale-105 ${
                          grande
                            ? "inset-0 size-full object-cover object-[40%_50%] opacity-90"
                            : "-right-6 top-3 w-[85%] opacity-85"
                        }`}
                      />
                    )}
                    {/* Keeps the name legible over the photo. */}
                    <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-[#141416] to-transparent" />
                    <span className="relative flex items-start justify-between">
                      <span className="text-[13px] font-semibold tabular-nums text-[#8d8d93]">{String(i + 1).padStart(2, "0")}</span>
                      <span
                        aria-hidden="true"
                        className="grid size-10 place-items-center rounded-full bg-white/10 text-lg transition-[transform,background-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:bg-[#d71f2a]"
                      >
                        ↗
                      </span>
                    </span>
                    <span className="relative flex flex-col gap-1">
                      <span
                        className={`font-black uppercase leading-[0.95] tracking-[-0.02em] [font-stretch:125%] ${
                          grande ? "text-[clamp(36px,5vw,64px)]" : "text-[clamp(20px,2.4vw,30px)]"
                        }`}
                      >
                        {s.value}
                      </span>
                      <span className="text-sm tabular-nums text-[#b4b4b9] sm:text-base">{n(s.n)} piezas</span>
                    </span>
                  </Link>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2.5">
              {enChip.map((s) => (
                <Link
                  key={s.value}
                  href={tienda("sis", s.value)}
                  className="inline-flex h-12 items-center gap-2.5 rounded-full border border-white/[0.12] px-5 text-[15px] font-semibold transition-colors hover:border-[#d71f2a]"
                >
                  {s.value} <span className="tabular-nums text-[#8d8d93]">{n(s.n)}</span>
                </Link>
              ))}
              <Link
                href="/tienda"
                className="inline-flex h-12 items-center gap-2.5 rounded-full bg-[#f2f2f3] px-5 text-[15px] font-bold text-[#0b0b0c] transition-transform duration-150 active:scale-[0.97]"
              >
                Todo el catálogo{facetas?.total ? ` · ${n(facetas.total)}` : ""} <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </section>
      )}

      {marcas.length > 0 && (
        <section aria-label="Marcas en existencia" className="overflow-hidden border-y border-white/[0.08] py-6 sm:py-10">
          {/* Two copies back to back; the strip slides by exactly one. */}
          <div className="flex w-max animate-[ruli-cinta_40s_linear_infinite] motion-reduce:animate-none">
            {[0, 1].map((copia) => (
              <div key={copia} aria-hidden={copia === 1} className="flex">
                {marcas.map((m, i) => (
                  <Link
                    key={m.value}
                    href={tienda("marca", m.value)}
                    tabIndex={copia === 1 ? -1 : undefined}
                    className="group flex items-center gap-6 pr-6 sm:gap-12 sm:pr-12"
                  >
                    <span
                      className={`text-[clamp(56px,10vw,120px)] font-black uppercase leading-none tracking-[-0.02em] [font-stretch:125%] transition-colors group-hover:text-[#d71f2a] ${
                        i % 2 ? "text-transparent [-webkit-text-stroke:1.5px_rgba(255,255,255,0.32)] group-hover:[-webkit-text-stroke-color:#d71f2a]" : ""
                      }`}
                    >
                      {m.value}
                    </span>
                    <span className="flex flex-col text-sm tabular-nums text-[#8d8d93]">
                      <b className="text-[22px] text-[#f2f2f3]">{n(m.n)}</b>piezas
                    </span>
                    <span aria-hidden="true" className="size-3.5 rounded-full bg-[#d71f2a]" />
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      <section id="comprar" className="scroll-mt-4 px-4 py-20 sm:px-12 sm:py-28">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-10 sm:gap-14">
          <h2 className={titulo}>
            Cómo
            <br />
            te llega
          </h2>
          <ol className="m-0 grid list-none gap-3 p-0 sm:gap-4 md:grid-cols-3">
            {PASOS.map((p, i) => (
              <li key={p.titulo} className="flex flex-col gap-5 rounded-[22px] border border-white/[0.07] bg-[#141416] px-6 py-7 sm:px-7 sm:py-8">
                <span className="text-[clamp(64px,8vw,88px)] font-black leading-[0.8] text-transparent [-webkit-text-stroke:1.5px_rgba(255,255,255,0.32)] [font-stretch:125%]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="m-0 text-2xl font-extrabold">{p.titulo}</h3>
                <p className="m-0 text-base leading-relaxed text-[#8d8d93]">{p.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-12 sm:pb-28">
        <div className="relative mx-auto grid max-w-[1240px] items-end gap-8 overflow-hidden rounded-[28px] bg-[#d71f2a] px-6 py-12 sm:px-16 sm:py-[72px] lg:grid-cols-[1fr_auto] lg:gap-12">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_0%,rgba(255,255,255,0.22),transparent_55%)]" />
          <div className="relative flex min-w-0 flex-col gap-4">
            <h2 className="m-0 text-[clamp(30px,7vw,80px)] font-black uppercase leading-[0.88] tracking-[-0.02em] text-white [font-stretch:125%]">
              ¿No encuentras
              <br />
              la pieza?
            </h2>
            <p className="m-0 max-w-[520px] text-lg leading-normal text-white/90">
              Mándanos foto de la pieza vieja o el número de parte. Te decimos cuál le queda a tu carro y cuánto cuesta.
            </p>
          </div>
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="relative inline-flex h-16 items-center justify-between gap-3 rounded-[18px] bg-[#0b0b0c] px-6 text-base font-bold whitespace-nowrap sm:px-7 sm:text-lg text-white transition-transform duration-150 active:scale-[0.97] sm:justify-start"
          >
            Escríbenos por WhatsApp <span aria-hidden="true">→</span>
          </a>
        </div>
      </section>

      <footer className="relative overflow-hidden border-t border-white/[0.08] px-4 pt-14 sm:px-12 sm:pt-[72px]">
        <div className="mx-auto grid max-w-[1240px] grid-cols-2 gap-10 text-[15px] leading-[1.7] text-[#8d8d93] lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="col-span-2 flex flex-col gap-4 lg:col-span-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset in public/ */}
            <img src="/landing/ruli-logo-blanco.webp" alt="Refaccionaria Ruli" width={640} height={320} className="h-10 w-auto self-start" />
            <span className="max-w-[280px]">Refacciones y autopartes con la pieza exacta para tu carro.</span>
          </div>
          <div className="flex flex-col">
            <b className="mb-2 text-[#f2f2f3]">Tienda</b>
            <Link href="/tienda" className="hover:text-white">Catálogo</Link>
            <a href="#carro" className="hover:text-white">Buscar por carro</a>
            <a href="#comprar" className="hover:text-white">Cómo comprar</a>
          </div>
          {(info.direccion || info.horario) && (
            <div className="flex flex-col">
              <b className="mb-2 text-[#f2f2f3]">Mostrador</b>
              {info.direccion && <span>{[info.direccion, info.ciudad].filter(Boolean).join(", ")}</span>}
              {info.horario && <span>{info.horario}</span>}
            </div>
          )}
          <div className="flex flex-col">
            <b className="mb-2 text-[#f2f2f3]">Contacto</b>
            <a href={wa} target="_blank" rel="noopener noreferrer" className="hover:text-white">
              WhatsApp{tel ? ` ${tel}` : ""}
            </a>
            <SignInButton mode="modal" forceRedirectUrl="/inicio">
              <button className="cursor-pointer text-left hover:text-white">Entrar (personal)</button>
            </SignInButton>
          </div>
        </div>
        <div
          aria-hidden="true"
          className="mt-14 h-[22vw] max-h-[220px] overflow-hidden text-center text-[36vw] font-black uppercase leading-[0.72] tracking-[-0.02em] text-[#141416] [font-stretch:125%] lg:text-[360px]"
        >
          RULI
        </div>
      </footer>
    </div>
  );
}
