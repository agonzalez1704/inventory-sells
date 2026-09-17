"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Smartphone, X } from "lucide-react";
import { foto } from "@/lib/foto";
import { formatPrecio } from "@/lib/money";
import { MARCA } from "@/lib/marca";
import { cn } from "@/lib/utils";
import { sugerirBusqueda, type Sugerencias } from "./sugerencias-actions";

const ES_RULI = MARCA.id === "ruli";
const unidad = (n: number) => (ES_RULI ? (n === 1 ? "pieza" : "piezas") : n === 1 ? "modelo" : "modelos");
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const esEscritorio = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

/** The typed text in bold wherever it appears — the customer sees why it matched. */
function Resaltado({ texto, q }: { texto: string; q: string }) {
  const i = q ? texto.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, i)}
      <strong className="font-semibold">{texto.slice(i, i + q.length)}</strong>
      {texto.slice(i + q.length)}
    </>
  );
}

/**
 * The search box, per the approved design.
 *
 * Phone: focusing it turns the same box into a full screen — the input never
 * remounts, so the keyboard stays up — with the first models, where the query
 * lands ("“a31” en Pantallas 3") and "Ver los 3 modelos". Desktop: the same
 * content as a dropdown, driven by the arrow keys and Enter.
 *
 * Nothing navigates while typing: the suggestions are the live feedback, and
 * the results page only loads when the customer commits to a query.
 */
export function BuscadorTienda({
  q,
  placeholder,
  pending,
  onEnviar,
  onAbierto,
}: {
  q: string;
  placeholder: string;
  pending: boolean;
  /** Commit a search; `cat` scopes it to one part type. */
  onEnviar: (q: string, cat?: string) => void;
  /** The phone overlay needs its sticky parent lifted above the header. */
  onAbierto?: (abierto: boolean) => void;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [texto, setTexto] = useState(q);
  const [abierto, setAbierto] = useState(false);
  const [sug, setSug] = useState<Sugerencias | null>(null);
  const [cargando, setCargando] = useState(false);
  const [activo, setActivo] = useState(-1);

  // The URL is the authority on what was searched (back/forward, "Limpiar").
  useEffect(() => setTexto(q), [q]);

  useEffect(() => {
    onAbierto?.(abierto);
    // Phone overlay: the page behind must not scroll under the finger.
    if (!abierto || esEscritorio()) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  useEffect(() => {
    const t = texto.trim();
    setActivo(-1);
    if (!abierto || t.length < 2) {
      setSug(null);
      setCargando(false);
      return;
    }
    let vivo = true;
    setCargando(true);
    const id = setTimeout(() => {
      sugerirBusqueda(t)
        .then((r) => {
          if (vivo) setSug(r.ok ? r.data : null);
        })
        .catch(() => {})
        .finally(() => {
          if (vivo) setCargando(false);
        });
    }, 220);
    return () => {
      vivo = false;
      clearTimeout(id);
    };
  }, [texto, abierto]);

  function cerrar() {
    setAbierto(false);
    input.current?.blur();
  }

  function enviar(cat?: string) {
    cerrar();
    onEnviar(texto.trim(), cat);
  }

  function abrirModelo(id: string) {
    cerrar();
    router.push(`/tienda/${id}`);
  }

  function teclas(e: React.KeyboardEvent<HTMLInputElement>) {
    const n = sug?.modelos.length ?? 0;
    if (e.key === "ArrowDown" && n) {
      e.preventDefault();
      setActivo((a) => (a + 1) % n);
    } else if (e.key === "ArrowUp" && n) {
      e.preventDefault();
      setActivo((a) => (a <= 0 ? n - 1 : a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activo >= 0 && sug?.modelos[activo]) abrirModelo(sug.modelos[activo].id);
      else enviar();
    } else if (e.key === "Escape") {
      cerrar();
    }
  }

  const t = texto.trim();
  const panel = abierto && t.length >= 2;

  return (
    <div
      className={cn(
        "relative lg:max-w-2xl",
        abierto &&
          "fixed inset-0 z-50 flex flex-col bg-background px-4 pt-3 lg:relative lg:inset-auto lg:z-40 lg:block lg:bg-transparent lg:p-0",
      )}
    >
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={input}
            type="search"
            enterKeyHint="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onFocus={() => setAbierto(true)}
            // Desktop only: clicking away closes the dropdown. Delayed so a
            // click on a suggestion lands first. On a phone the overlay stays
            // until "Cancelar" — scrolling the list must not dismiss it.
            onBlur={() => esEscritorio() && setTimeout(() => setAbierto(false), 150)}
            onKeyDown={teclas}
            placeholder={placeholder}
            aria-label="Buscar"
            aria-expanded={panel}
            aria-controls="sugerencias-tienda"
            autoComplete="off"
            // 16px text: smaller makes iOS zoom the page on focus.
            className={cn(
              "h-12 w-full rounded-xl border bg-background pl-11 pr-12 text-base text-foreground outline-hidden placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden",
              abierto ? "border-tienda-500 ring-4 ring-tienda-100" : "border-border",
            )}
          />
          {pending || cargando ? (
            <Loader2 className="absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-tienda-500" />
          ) : (
            texto && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setTexto("");
                  input.current?.focus();
                }}
                aria-label="Borrar búsqueda"
                className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center text-muted-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            )
          )}
        </div>
        {abierto && (
          <button
            type="button"
            onClick={() => {
              setTexto(q);
              cerrar();
            }}
            className="h-11 shrink-0 cursor-pointer px-1 text-[15px] font-medium text-tienda-700 lg:hidden"
          >
            Cancelar
          </button>
        )}
      </div>

      {panel && (
        <div
          id="sugerencias-tienda"
          // Keeps focus in the input while a suggestion is being clicked.
          onMouseDown={(e) => e.preventDefault()}
          className="-mx-4 mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 lg:absolute lg:inset-x-0 lg:top-full lg:mx-0 lg:mt-2 lg:max-h-[70vh] lg:rounded-2xl lg:border lg:border-border lg:bg-background lg:p-0 lg:shadow-xl lg:shadow-black/10"
        >
          {!sug ? (
            <p className="px-1 py-4 text-sm text-muted-foreground lg:px-5">Buscando…</p>
          ) : sug.total === 0 ? (
            <div className="px-1 py-4 lg:px-5">
              <p className="text-sm text-foreground">Sin resultados para “{sug.q}”.</p>
              <button
                type="button"
                onClick={() => enviar()}
                className="mt-2 h-11 cursor-pointer text-sm font-medium text-tienda-700 hover:underline"
              >
                Buscar de todos modos y ver compatibles
              </button>
            </div>
          ) : (
            <>
              <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_240px]">
                <div className="lg:p-2">
                  <p className="px-1 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:px-3">
                    {ES_RULI ? "Piezas" : "Modelos"}
                  </p>
                  <ul>
                    {sug.modelos.map((m, i) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => abrirModelo(m.id)}
                          onMouseEnter={() => setActivo(i)}
                          className={cn(
                            "flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-xl px-1 py-2 text-left transition-colors lg:px-3",
                            i === activo ? "bg-tienda-50" : "hover:bg-muted/50",
                          )}
                        >
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-muted/60">
                            {m.imagen ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={foto(m.imagen, 128)} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Smartphone className="h-5 w-5 text-muted-foreground/40" />
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-base text-foreground">
                              {m.brand ? `${m.brand} ` : ""}
                              <Resaltado texto={m.modelo} q={t} />
                            </span>
                            <span className="block truncate text-[13px] text-muted-foreground">
                              {[
                                m.category ? cap(m.category) : null,
                                m.calidades > 1 ? `${m.calidades} ${ES_RULI ? "opciones" : "calidades"}` : null,
                                m.desde_cents
                                  ? `${m.calidades > 1 ? "desde " : ""}${formatPrecio(m.desde_cents)}`
                                  : "A cotizar",
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                          {i === activo && (
                            <span className="hidden rounded-md border border-tienda-200 px-1.5 py-0.5 text-xs text-tienda-800 lg:inline">
                              ↵
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-2 border-t border-border pt-3 lg:mt-0 lg:border-l lg:border-t-0 lg:p-4">
                  <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:px-0">
                    Buscar en
                  </p>
                  <div className="flex flex-wrap gap-2 lg:flex-col">
                    {sug.categorias.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => enviar(c.value)}
                        className="inline-flex h-11 cursor-pointer items-center justify-between gap-2 rounded-full border border-border px-4 text-sm text-foreground transition-colors hover:border-tienda-300 lg:h-10 lg:rounded-xl"
                      >
                        <span className="truncate">
                          “{sug.q}” en {cap(c.value)}
                        </span>
                        <span className="text-[13px] tabular-nums text-muted-foreground">{c.n}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => enviar()}
                      className="inline-flex h-11 cursor-pointer items-center justify-between gap-2 rounded-full border border-border px-4 text-sm text-foreground transition-colors hover:border-tienda-300 lg:h-10 lg:rounded-xl"
                    >
                      <span className="truncate">“{sug.q}” en todo</span>
                      <span className="text-[13px] tabular-nums text-muted-foreground">{sug.total}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Phone: one big way to commit. Desktop: a footer with the keys. */}
              <button
                type="button"
                onClick={() => enviar()}
                className="mt-5 flex h-14 w-full cursor-pointer items-center justify-center rounded-2xl bg-tienda-600 text-[15px] font-semibold text-white lg:hidden"
              >
                Ver {sug.total === 1 ? `el ${unidad(1)}` : `los ${sug.total} ${unidad(sug.total)}`}
              </button>
              <div className="hidden items-center justify-between border-t border-border px-5 py-2.5 text-[13px] text-muted-foreground lg:flex">
                <span>↑ ↓ para moverte · ↵ para abrir</span>
                <button
                  type="button"
                  onClick={() => enviar()}
                  className="cursor-pointer font-medium text-tienda-700 hover:underline"
                >
                  Ver {sug.total === 1 ? `el ${unidad(1)}` : `los ${sug.total} ${unidad(sug.total)}`} para “{sug.q}”
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
