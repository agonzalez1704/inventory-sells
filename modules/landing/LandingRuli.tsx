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

const tituloSeccion =
  "m-0 text-[clamp(36px,5vw,64px)] font-extrabold leading-none tracking-[-0.02em] [font-stretch:112%]";

export async function LandingRuli() {
  const [facetas, info] = await Promise.all([
    // Same cache entry as /tienda with no filters. If the counts fail the page
    // still renders, just without numbers.
    facetasTienda({}).then(leerFacetas).catch(() => null),
    getTiendaInfo(),
  ]);
  const whatsapp = process.env.STORE_WHATSAPP ?? null;
  const wa = waHref(whatsapp);

  const sistemas = [...(facetas?.sis ?? [])].sort(porCantidad).slice(0, 6);
  const marcas = [...(facetas?.marca ?? [])].sort(porCantidad).slice(0, 4);
  const suspension = facetas?.sis.find((s) => /suspensi/i.test(s.value)) ?? null;
  const pares = (facetas?.vmm ?? []).map((o) => {
    const i = o.value.indexOf("|");
    return { marca: o.value.slice(0, i), modelo: o.value.slice(i + 1) };
  });

  return (
    <div className={`${archivo.variable} bg-white text-[#111113] [font-family:var(--font-archivo),system-ui,sans-serif]`}>
      <CarroScroll
        encabezado={
          <header className="flex items-center gap-4 px-4 py-5 sm:gap-7 sm:px-12 sm:py-6">
            <Link href="/" aria-label="Refaccionaria Ruli — inicio">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset in public/, sized by height */}
              <img src="/landing/ruli-logo-blanco.webp" alt="Refaccionaria Ruli" width={640} height={320} className="h-8 w-auto sm:h-9" />
            </Link>
            <span className="flex-1" />
            <nav aria-label="Principal" className="flex gap-7 text-[15px] font-medium">
              <Link href="/tienda" className="hover:text-white">Catálogo</Link>
              <a href="#carro" className="hidden hover:text-white sm:inline">Buscar por carro</a>
              <a href="#comprar" className="hidden hover:text-white sm:inline">Cómo comprar</a>
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

      <section id="carro" className="scroll-mt-4 bg-[#f3f3f4]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-12 px-4 py-[clamp(56px,8vw,112px)] sm:px-12">
          <div className="flex flex-[1_1_340px] flex-col gap-4">
            <h2 className={tituloSeccion}>Tu carro primero</h2>
            <p className="m-0 text-lg leading-relaxed text-[#3d3d42]">
              Elige armadora y modelo. Te mostramos solo lo que le queda, y por cada pieza las otras marcas que sirven
              igual, con su precio.
            </p>
          </div>
          <div className="flex-[1_1_420px] rounded-[20px] bg-white p-5 shadow-[0_1px_0_#e4e4e7,0_24px_48px_rgba(17,17,19,0.08)]">
            {pares.length ? (
              <BuscarCarro pares={pares} />
            ) : (
              <Link href="/tienda" className="font-semibold text-[#d71f2a]">
                Ver el catálogo
              </Link>
            )}
          </div>
        </div>
      </section>

      {sistemas.length > 0 && (
        <section id="sistemas" className="mx-auto max-w-[1200px] px-4 py-[clamp(56px,8vw,112px)] sm:px-12">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <h2 className={tituloSeccion}>Busca por sistema</h2>
            <p className="m-0 max-w-[360px] text-base leading-normal text-[#55555b]">
              Cada número es lo que hay hoy en el catálogo de Ruli para ese sistema.
            </p>
          </div>
          <ul className="m-0 list-none border-t-2 border-[#111113] p-0">
            {sistemas.map((s) => (
              <li key={s.value} className="border-b border-[#dcdce0]">
                <Link
                  href={tienda("sis", s.value)}
                  className="group flex items-baseline justify-between gap-4 py-5 transition-colors hover:text-[#d71f2a]"
                >
                  <span className="text-[clamp(24px,3vw,40px)] font-bold tracking-[-0.01em]">{s.value}</span>
                  <span className="text-[clamp(16px,2vw,24px)] font-medium tabular-nums text-[#55555b] group-hover:text-[#d71f2a]">
                    {n(s.n)} piezas
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {marcas.length > 0 && (
        <section className="mx-auto max-w-[1200px] px-4 py-[clamp(56px,8vw,96px)] sm:px-12">
          <h2 className="m-0 mb-7 text-base font-semibold text-[#55555b]">Marcas en existencia</h2>
          <div className="flex flex-wrap gap-x-12 gap-y-3 text-[clamp(34px,6vw,84px)] font-black uppercase leading-none tracking-[-0.02em] [font-stretch:125%]">
            {marcas.map((m, i) => (
              <Link
                key={m.value}
                href={tienda("marca", m.value)}
                className={`transition-colors hover:text-[#d71f2a] ${i % 2 ? "text-[#9a9aa0]" : ""}`}
              >
                {m.value}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section id="comprar" className="scroll-mt-4 bg-[#0f0f10] text-[#e9e9ea]">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-4 py-[clamp(56px,8vw,112px)] sm:px-12">
          <h2 className={tituloSeccion}>Cómo te llega</h2>
          <div className="grid gap-8 border-t border-white/20 pt-7 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
            <div className="flex flex-col gap-2">
              <h3 className="m-0 text-[22px] font-bold">Recoge en mostrador</h3>
              <p className="m-0 text-base leading-relaxed text-[#b4b4b9]">
                Pide en línea y pasa por ella. Lo que no está en mostrador te lo traemos de otro almacén.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="m-0 text-[22px] font-bold">Envío a todo México</h3>
              <p className="m-0 text-base leading-relaxed text-[#b4b4b9]">
                El costo se calcula con tu código postal antes de pagar.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="m-0 text-[22px] font-bold">¿No encuentras la pieza?</h3>
              <p className="m-0 text-base leading-relaxed text-[#b4b4b9]">
                <a href={wa} target="_blank" rel="noopener noreferrer" className="text-white underline underline-offset-4">
                  Mándanos por WhatsApp
                </a>{" "}
                foto de la pieza vieja o el número de parte y te decimos cuál le queda.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#0f0f10] text-[#a3a3a8]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-start gap-x-12 gap-y-6 px-4 py-10 text-sm leading-relaxed sm:px-12">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset in public/ */}
          <img src="/landing/ruli-logo-blanco.webp" alt="Refaccionaria Ruli" width={640} height={320} className="h-[30px] w-auto" />
          <span className="flex-1" />
          {(info.direccion || info.horario) && (
            <span>
              {[info.direccion, info.ciudad].filter(Boolean).join(", ")}
              {info.horario && (
                <>
                  <br />
                  {info.horario}
                </>
              )}
            </span>
          )}
          <span>
            <a href={wa} target="_blank" rel="noopener noreferrer" className="hover:text-white">
              WhatsApp {prettyPhone(whatsapp) ?? ""}
            </a>
            <br />
            <SignInButton mode="modal">
              <button className="cursor-pointer hover:text-white">Entrar (personal)</button>
            </SignInButton>
          </span>
        </div>
      </footer>
    </div>
  );
}
