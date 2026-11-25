"use client";

import { useEffect, useRef } from "react";

// Ruli's landing hero: a coupé over "RULI" that comes apart into its
// refacciones and ends on the shock absorber, driven by the page scroll.
//
// The scroll scrubs a video (Seedance, two clips joined; the explosion slowed
// 3x so it doesn't jump). Encoded with a keyframe every 4 frames and no
// B-frames, so a seek decodes at most 3 frames and keeps up with the wheel.
//
// Everything per-frame is written straight to the elements' style from one
// rAF per scroll — no React state, so scrolling never re-renders.

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
  const video = useRef<HTMLVideoElement>(null);
  const tipo = useRef<HTMLDivElement>(null);
  const c1 = useRef<HTMLDivElement>(null);
  const c2 = useRef<HTMLDivElement>(null);
  const c3 = useRef<HTMLDivElement>(null);
  const pista = useRef<HTMLSpanElement>(null);
  const pasos = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const s = seccion.current;
    const v = video.current;
    if (!s || !v) return;
    let raf = 0;

    const pintar = () => {
      raf = 0;
      const r = s.getBoundingClientRect();
      const max = r.height - window.innerHeight;
      const p = max > 0 ? clamp(-r.top / max) : 0;

      // The first and last 4% of the scroll hold still, so the page settles
      // on the whole car and on the part before moving on.
      const dur = Number.isFinite(v.duration) ? v.duration : 0;
      const t = dur * clamp((p - 0.04) / 0.92);
      if (dur && !v.seeking && Math.abs(v.currentTime - t) > 0.02) v.currentTime = t;

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

      const etapa = t < 0.6 ? 0 : t < 4.6 ? 1 : 2;
      pasos.current?.querySelectorAll("li").forEach((li, i) => {
        li.dataset.activo = String(i === etapa);
      });
    };
    const pedir = () => {
      if (!raf) raf = requestAnimationFrame(pintar);
    };

    window.addEventListener("scroll", pedir, { passive: true });
    window.addEventListener("resize", pedir);
    v.addEventListener("loadedmetadata", pedir);
    // A seek skipped while another was in flight catches up here.
    v.addEventListener("seeked", pedir);
    // iOS paints no frame for a seek until the video has played once.
    v.play().then(() => v.pause()).catch(() => {});
    pintar();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", pedir);
      window.removeEventListener("resize", pedir);
      v.removeEventListener("loadedmetadata", pedir);
      v.removeEventListener("seeked", pedir);
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
        <video
          ref={video}
          muted
          playsInline
          preload="auto"
          poster="/landing/ruli-carro.webp"
          aria-label="Un coupé se desarma en refacciones y termina en el amortiguador"
          className="absolute inset-x-0 top-[24svh] w-full origin-top scale-[1.15] mix-blend-lighten [mask-image:linear-gradient(transparent,black_15%,black_85%,transparent)] md:inset-0 md:[mask-image:none] md:top-0 md:h-full md:scale-100 md:object-cover"
        >
          <source src="/landing/ruli-carro-movil.mp4" type="video/mp4" media="(max-width: 767px)" />
          <source src="/landing/ruli-carro.mp4" type="video/mp4" />
        </video>
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
