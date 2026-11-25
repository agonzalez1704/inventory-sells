"use client";

import { useEffect, useRef } from "react";

// Ruli's landing hero: a coupé over "RULI" that comes apart into its
// refacciones and ends on the shock absorber, driven by the page scroll.
//
// The scroll picks a frame of a pre-rendered sequence (Seedance, two clips
// joined, the explosion slowed 3x, upscaled to 2K) and paints it on a canvas.
// Not a <video> scrubbed by currentTime: a phone in Low Power Mode never lets
// it play, and then iOS paints no frame for a seek, so the car never moved.
// Frames load coarse-to-fine (every 16th, then 8th, …) and the nearest one
// already loaded is painted, so the scroll works before the last one lands.
//
// Everything per-frame is written straight to the elements from one rAF per
// scroll — no React state, so scrolling never re-renders.

const FRAMES = 113;
const frame = (dir: "d" | "m", i: number) => `/landing/carro/${dir}/${String(i).padStart(3, "0")}.webp`;
/** Every 16th frame first, then the gaps: a coarse scrub is usable at once. */
const ORDEN = [16, 8, 4, 2, 1].flatMap((paso, k, pasos) =>
  Array.from({ length: FRAMES }, (_, i) => i).filter((i) => i % paso === 0 && (k === 0 || i % pasos[k - 1] !== 0)),
);

const clamp = (x: number) => Math.min(1, Math.max(0, x));
/** 0 → 1 between a and b, eased so each change starts and lands softly. */
const tramo = (p: number, a: number, b: number) => {
  const t = clamp((p - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function CarroScroll({
  encabezado,
  inicio,
  medio,
  final,
}: {
  encabezado: React.ReactNode;
  /** First frame's copy: carries the page's h1. */
  inicio: React.ReactNode;
  medio: React.ReactNode;
  /** Last frame's copy, with the call to action. */
  final: React.ReactNode;
}) {
  const seccion = useRef<HTMLElement>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);
  const tipo = useRef<HTMLDivElement>(null);
  const c1 = useRef<HTMLDivElement>(null);
  const c2 = useRef<HTMLDivElement>(null);
  const c3 = useRef<HTMLDivElement>(null);
  const pista = useRef<HTMLSpanElement>(null);
  const pasos = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const s = seccion.current;
    const c = lienzo.current;
    const ctx = c?.getContext("2d");
    if (!s || !c || !ctx) return;
    let raf = 0;
    let vivo = true;
    let pintado = -1;
    let quiero = 0;
    const cuadros: (HTMLImageElement | undefined)[] = [];
    const dir = matchMedia("(max-width: 767px)").matches ? "m" : "d";

    /** The loaded frame nearest to i (they arrive coarse-to-fine). */
    const cercano = (i: number) => {
      for (let d = 0; d < FRAMES; d++) {
        if (cuadros[i - d]) return i - d;
        if (cuadros[i + d]) return i + d;
      }
      return -1;
    };
    const dibujar = () => {
      const i = cercano(quiero);
      const img = cuadros[i];
      if (!img || i === pintado) return;
      if (c.width !== img.naturalWidth) {
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
      }
      ctx.drawImage(img, 0, 0);
      pintado = i;
    };

    // Six at a time, in ORDEN; each one repaints if it is nearer than what's up.
    let siguiente = 0;
    const cargar = () => {
      if (!vivo || siguiente >= ORDEN.length) return;
      const i = ORDEN[siguiente++];
      const img = new Image();
      img.src = frame(dir, i);
      img
        .decode()
        .then(() => {
          if (!vivo) return;
          cuadros[i] = img;
          dibujar();
        })
        .catch(() => {})
        .finally(cargar);
    };
    for (let k = 0; k < 6; k++) cargar();

    const pintar = () => {
      raf = 0;
      const r = s.getBoundingClientRect();
      const max = r.height - window.innerHeight;
      const p = max > 0 ? clamp(-r.top / max) : 0;

      // The first and last 4% of the scroll hold still, so the page settles
      // on the whole car and on the part before moving on.
      const f = clamp((p - 0.04) / 0.92);
      quiero = Math.round(f * (FRAMES - 1));
      dibujar();

      const opacidad = (el: HTMLElement | null, o: number) => {
        if (!el) return;
        el.style.opacity = o.toFixed(3);
        // A faded caption must not catch taps meant for the one on top.
        el.style.pointerEvents = o > 0.5 ? "auto" : "none";
      };
      if (tipo.current) {
        tipo.current.style.opacity = (1 - tramo(p, 0.03, 0.14)).toFixed(3);
        tipo.current.style.transform = `scale(${(1 + 0.15 * tramo(p, 0, 0.14)).toFixed(3)})`;
      }
      opacidad(c1.current, 1 - tramo(p, 0.04, 0.12));
      opacidad(c2.current, tramo(p, 0.3, 0.38) * (1 - tramo(p, 0.5, 0.56)));
      opacidad(c3.current, tramo(p, 0.86, 0.94));
      opacidad(pista.current, 1 - tramo(p, 0, 0.04));

      // Whole car, then coming apart, then the shock absorber.
      const etapa = f < 0.064 ? 0 : f < 0.49 ? 1 : 2;
      pasos.current?.querySelectorAll("li").forEach((li, i) => {
        li.dataset.activo = String(i === etapa);
      });
    };
    const pedir = () => {
      if (!raf) raf = requestAnimationFrame(pintar);
    };

    window.addEventListener("scroll", pedir, { passive: true });
    window.addEventListener("resize", pedir);
    pintar();

    return () => {
      vivo = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", pedir);
      window.removeEventListener("resize", pedir);
    };
  }, []);

  return (
    <section ref={seccion} className="relative h-[420svh] bg-[#0f0f10] text-[#e9e9ea]">
      <div className="sticky top-0 h-svh overflow-hidden">
        <div
          ref={tipo}
          aria-hidden="true"
          className="absolute inset-x-0 top-[16svh] text-center text-[31vw] font-black leading-[0.8] tracking-[-0.03em] text-[#ececec] [font-stretch:125%] will-change-transform md:top-[14svh] lg:text-[29vw]"
        >
          RULI
        </div>

        {/* Lighten: the car's black studio drops out and "RULI" shows through
            behind it. On a phone it keeps its 16:9 at full width, tucked under the
            letters, so the whole car fits instead of being cropped to a wheel. */}
        <canvas
          ref={lienzo}
          width={1920}
          height={1080}
          role="img"
          aria-label="Un coupé se desarma en refacciones y termina en el amortiguador"
          style={{ backgroundImage: "url(/landing/ruli-carro.webp)" }}
          className="absolute inset-x-0 top-[24svh] aspect-video w-full origin-top scale-[1.15] bg-cover bg-center mix-blend-lighten [mask-image:linear-gradient(transparent,black_15%,black_85%,transparent)] md:inset-0 md:top-0 md:aspect-auto md:h-full md:scale-100 md:object-cover md:[mask-image:none]"
        />
        {/* Scrims: the copy and the nav sit on the footage, and the last frame
            is a bright red spring. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-[#0f0f10]/70 to-transparent" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-[#0f0f10]/90 via-[#0f0f10]/50 to-transparent" />

        <div className="absolute inset-x-0 top-0 z-10">{encabezado}</div>

        <div ref={c1} className="absolute inset-x-4 bottom-10 z-10 max-w-xl sm:inset-x-12 sm:bottom-14">
          {inicio}
        </div>
        <div ref={c2} className="absolute inset-x-4 bottom-10 z-10 max-w-xl opacity-0 sm:inset-x-12 sm:bottom-14">
          {medio}
        </div>
        <div ref={c3} className="absolute inset-x-4 bottom-10 z-10 max-w-lg opacity-0 sm:inset-x-12 sm:bottom-14">
          {final}
        </div>

        <ol
          ref={pasos}
          aria-hidden="true"
          className="absolute right-4 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-2.5 sm:right-12"
        >
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              data-activo={i === 0}
              className="h-9 w-1 rounded bg-white/20 transition-colors duration-200 data-[activo=true]:bg-[#d71f2a]"
            />
          ))}
        </ol>
        <span
          ref={pista}
          aria-hidden="true"
          className="absolute bottom-4 left-1/2 z-10 hidden -translate-x-1/2 text-[13px] text-[#8d8d93] sm:block"
        >
          Desliza para ver qué hay adentro
        </span>
      </div>
    </section>
  );
}
