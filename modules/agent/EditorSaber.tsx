"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Car, Check, Minus, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/errors";
import { formatMXN } from "@/lib/money";
import { normalize } from "@/lib/search";
import { MARCA } from "@/lib/marca";
import { contestarDeNuevo } from "./bandeja-actions";
import {
  borrarSaber,
  guardarSaber,
  probarJuego,
  probarSinonimo,
  sugerirPiezas,
  type ResultadoPrueba,
} from "./saberes-actions";
import type { JuegoArmado, Pieza, Saber, TipoSaber } from "./saberes";

// One editor for everything the agent is taught. On the config screen it shows
// every section at once; from a conversation ("Enseñarle") it walks the same
// sections as steps. Same state, same save — two layouts.

const ES_AUTOPARTES = MARCA.id === "ruli";

type PiezaUI = Pieza & { incluida: boolean; disponible?: boolean; ejemplo?: string };

export type Borrador = {
  id: string | null;
  tipo: TipoSaber;
  nombre: string;
  frases: string[];
  piezas: PiezaUI[];
  texto: string;
};

export const borradorDe = (s: Saber): Borrador => ({
  id: s.id,
  tipo: s.tipo,
  nombre: s.nombre,
  frases: s.frases,
  piezas: s.piezas.map((p) => ({ ...p, incluida: true })),
  texto: s.texto ?? "",
});

export const borradorNuevo = (tipo: TipoSaber, frase = ""): Borrador => ({
  id: null,
  tipo,
  nombre: tipo === "juego" && frase ? frase.charAt(0).toUpperCase() + frase.slice(1) : "",
  frases: frase ? [frase] : [],
  piezas: [],
  texto: "",
});

const TIPOS: { tipo: TipoSaber; titulo: string; desc: string }[] = [
  { tipo: "juego", titulo: "Un juego de varias piezas", desc: "Busca cada pieza y cotiza el juego completo" },
  { tipo: "sinonimo", titulo: "Otro nombre de una pieza", desc: ES_AUTOPARTES ? 'Como "pastillas" = balatas' : 'Como "cristal" = glass' },
  { tipo: "nota", titulo: "Una regla o dato del negocio", desc: "Una nota que toma en cuenta al contestar" },
];

const NOMBRE_TIPO: Record<TipoSaber, string> = { juego: "Juego de piezas", sinonimo: "Sinónimo", nota: "Nota" };

export function EditorSaber({
  inicial,
  vehiculoInicial = "",
  origen,
  modo,
  onListo,
  onCancelar,
}: {
  inicial: Borrador;
  vehiculoInicial?: string;
  /** Taught from a conversation: its key and the customer's message. */
  origen?: { clave: string; mensaje: string };
  modo: "pasos" | "completo";
  onListo: (r: { id: string | null; contesto: boolean }) => void;
  onCancelar?: () => void;
}) {
  const [b, setB] = useState(inicial);
  const [vehiculo, setVehiculo] = useState(vehiculoInicial);
  const [paso, setPaso] = useState(1);
  const [contestar, setContestar] = useState(Boolean(origen));
  const [guardando, setGuardando] = useState(false);
  const pasos = b.tipo === "juego" ? 3 : 2;
  const set = (p: Partial<Borrador>) => setB((x) => ({ ...x, ...p }));

  async function guardar() {
    setGuardando(true);
    try {
      const { id } = unwrap(
        await guardarSaber({
          id: b.id,
          tipo: b.tipo,
          nombre: b.tipo === "nota" ? b.nombre || b.texto.slice(0, 40) : b.nombre,
          frases: b.frases,
          piezas: b.piezas.filter((p) => p.incluida),
          texto: b.texto,
          origenClave: origen?.clave ?? null,
        }),
      );
      let contesto = false;
      if (origen && contestar) {
        try {
          unwrap(await contestarDeNuevo(origen.clave));
          contesto = true;
        } catch (e) {
          toast.error(`Aprendió, pero no pudo contestar: ${e instanceof Error ? e.message : "error"}`);
        }
      }
      toast.success(contesto ? `Aprendió "${b.nombre}" y le contestó al cliente` : "Guardado");
      onListo({ id, contesto });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!b.id || !confirm(`¿Borrar "${b.nombre}"? El agente deja de saberlo.`)) return;
    try {
      unwrap(await borrarSaber(b.id));
      toast.success("Borrado");
      onListo({ id: null, contesto: false });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo borrar");
    }
  }

  const que = (
    <SeccionQue b={b} set={set} origen={origen} vehiculo={vehiculo} setVehiculo={setVehiculo} completo={modo === "completo"} />
  );
  const detalle =
    b.tipo === "juego" ? (
      <SeccionPiezas b={b} set={set} vehiculo={vehiculo} setVehiculo={setVehiculo} frase={b.frases[0] ?? b.nombre} autoSugerir={modo === "pasos"} />
    ) : b.tipo === "sinonimo" ? (
      <SeccionSinonimo b={b} set={set} ejemploInicial={origen?.mensaje ?? ""} />
    ) : (
      <SeccionNota b={b} set={set} />
    );
  const nombreJuego = b.tipo === "juego" ? <SeccionNombreJuego b={b} set={set} /> : null;
  const probar =
    b.tipo === "juego" ? <SeccionProbar b={b} vehiculo={vehiculo} setVehiculo={setVehiculo} autoProbar={modo === "pasos"} /> : null;

  const contestarCheck = origen ? (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={contestar} onChange={(e) => setContestar(e.target.checked)} className="h-4 w-4 accent-brand" />
      Contestarle de nuevo al cliente con lo aprendido
    </label>
  ) : null;

  if (modo === "completo") {
    return (
      <div className="space-y-6">
        {!b.id && que}
        {nombreJuego}
        {detalle}
        {probar}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          {b.id && (
            <Button variant="ghost" className="mr-auto text-red-600" onClick={borrar}>
              Borrar
            </Button>
          )}
          {onCancelar && (
            <Button variant="secondary" onClick={onCancelar}>
              Descartar
            </Button>
          )}
          <Button variant="brand" loading={guardando} onClick={guardar}>
            Guardar {b.tipo === "juego" ? "juego" : b.tipo === "sinonimo" ? "sinónimo" : "nota"}
          </Button>
        </div>
      </div>
    );
  }

  const titulos = b.tipo === "juego" ? ["Qué quiso decir", "Piezas", "Probar y guardar"] : ["Qué quiso decir", "Enséñale"];
  const ultimo = paso === pasos;
  const puedeSeguir =
    paso === 1 ? b.frases.length > 0 : b.tipo !== "juego" || paso !== 2 || b.piezas.some((p) => p.incluida && p.obligatoria);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 gap-1.5 px-5 pb-3" style={{ gridTemplateColumns: `repeat(${pasos}, minmax(0, 1fr))` }}>
        {titulos.map((t, i) => (
          <div
            key={t}
            className={cn(
              "border-t-4 pt-1.5 text-[11px] font-semibold",
              i + 1 === paso ? "border-brand text-brand-foreground" : i + 1 < paso ? "border-foreground/70 text-foreground/80" : "border-border text-muted-foreground",
            )}
          >
            {i + 1} · {t}
          </div>
        ))}
      </div>
      <div data-base-ui-swipe-ignore className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain border-t border-border px-5 py-4">
        {paso === 1 ? que : paso === 2 ? detalle : (
          <>
            {nombreJuego}
            {probar}
          </>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {ultimo && <div className="w-full pb-1">{contestarCheck}</div>}
        {b.tipo === "juego" && paso === 2 && (
          <span className="mr-auto text-sm text-muted-foreground">
            <b className="text-foreground">{b.piezas.filter((p) => p.incluida).length} piezas</b> ·{" "}
            {b.piezas.filter((p) => p.incluida && p.obligatoria).length} obligatorias
          </span>
        )}
        <Button variant="secondary" className={cn(!(b.tipo === "juego" && paso === 2) && "ml-auto")} onClick={() => (paso === 1 ? onCancelar?.() : setPaso(paso - 1))}>
          {paso === 1 ? "Cancelar" : "Atrás"}
        </Button>
        {ultimo ? (
          <Button variant="brand" loading={guardando} onClick={guardar}>
            {origen && contestar ? "Guardar y contestar" : "Guardar"}
          </Button>
        ) : (
          <Button variant="brand" disabled={!puedeSeguir} onClick={() => setPaso(paso + 1)}>
            Siguiente
          </Button>
        )}
      </div>
    </div>
  );
}

type SeccionProps = { b: Borrador; set: (p: Partial<Borrador>) => void };

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-semibold text-foreground/80">{children}</span>;
}

function SeccionQue({
  b,
  set,
  origen,
  vehiculo,
  setVehiculo,
  completo,
}: SeccionProps & { origen?: { mensaje: string }; vehiculo: string; setVehiculo: (v: string) => void; completo: boolean }) {
  const frase = b.frases[0] ?? "";
  // On the config screen the phrases, name and car live in the sections below.
  if (completo)
    return (
      <div role="radiogroup" aria-label="Qué le vas a enseñar" className="grid gap-2 sm:grid-cols-3">
        {TIPOS.map((t) => (
          <label
            key={t.tipo}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5",
              b.tipo === t.tipo ? "border-brand bg-brand-soft" : "border-border hover:border-foreground/30",
            )}
          >
            <input type="radio" name="tipo-saber" checked={b.tipo === t.tipo} onChange={() => set(borradorNuevo(t.tipo))} className="mt-0.5 h-4 w-4 shrink-0 accent-brand" />
            <span>
              <span className="block text-sm font-semibold">{t.titulo}</span>
              <span className="block text-xs text-muted-foreground">{t.desc}</span>
            </span>
          </label>
        ))}
      </div>
    );
  return (
    <>
      {origen && (
        <div className="rounded-xl bg-muted px-3.5 py-2.5 text-sm leading-relaxed">
          <div className="mb-0.5 text-xs font-semibold text-muted-foreground">El cliente escribió</div>
          {origen.mensaje}
        </div>
      )}
      <label className="block space-y-1.5">
        <Etiqueta>{origen ? "Lo que no entendió" : b.tipo === "nota" ? "Título" : "Cómo lo dice el cliente"}</Etiqueta>
        <Input
          value={b.tipo === "nota" && !origen ? b.nombre : frase}
          onChange={(e) =>
            b.tipo === "nota" && !origen
              ? set({ nombre: e.target.value })
              : set({
                  frases: [e.target.value.toLowerCase(), ...b.frases.slice(1)],
                  ...(b.tipo === "juego" && (!b.nombre || normalize(b.nombre) === normalize(frase))
                    ? { nombre: e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1) }
                    : {}),
                })
          }
          placeholder={b.tipo === "nota" ? "Delantero o trasero" : ES_AUTOPARTES ? "suspensión completa" : "cristal"}
        />
      </label>
      {(
        <div role="radiogroup" aria-label="Qué es" className="space-y-2">
          <Etiqueta>¿Qué es?</Etiqueta>
          {TIPOS.map((t) => (
            <label
              key={t.tipo}
              className={cn(
                "flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5",
                b.tipo === t.tipo ? "border-brand bg-brand-soft" : "border-border hover:border-foreground/30",
              )}
            >
              <input
                type="radio"
                name="tipo-saber"
                checked={b.tipo === t.tipo}
                onChange={() => set({ tipo: t.tipo, nombre: t.tipo === "juego" && frase ? frase.charAt(0).toUpperCase() + frase.slice(1) : "" })}
                className="h-4 w-4 shrink-0 accent-brand"
              />
              <span>
                <span className="block text-sm font-semibold">{t.titulo}</span>
                <span className="block text-xs text-muted-foreground">{t.desc}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {b.tipo === "juego" && (
        <label className="block space-y-1.5">
          <Etiqueta>{ES_AUTOPARTES ? "Carro para sugerir y probar" : "Modelo para probar"}</Etiqueta>
          <span className="flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 focus-within:border-ring">
            <Car className="h-4 w-4 text-muted-foreground" />
            <input
              value={vehiculo}
              onChange={(e) => setVehiculo(e.target.value)}
              placeholder={ES_AUTOPARTES ? "vento 2017" : "iPhone 11 Pro Max"}
              className="h-full w-0 min-w-0 flex-1 bg-transparent text-base outline-hidden lg:text-sm"
            />
          </span>
        </label>
      )}
    </>
  );
}

function Stepper({ valor, onChange, sufijo }: { valor: number; onChange: (n: number) => void; sufijo?: string }) {
  return (
    <span className="inline-flex h-9 items-center rounded-lg border border-border">
      <button type="button" aria-label="Menos" className="flex h-full w-8 cursor-pointer items-center justify-center text-muted-foreground" onClick={() => onChange(Math.max(1, valor - 1))}>
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="min-w-8 text-center text-sm font-semibold">
        {valor}
        {sufijo && <span className="font-normal text-muted-foreground"> {sufijo}</span>}
      </span>
      <button type="button" aria-label="Más" className="flex h-full w-8 cursor-pointer items-center justify-center text-muted-foreground" onClick={() => onChange(Math.min(99, valor + 1))}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

function SeccionPiezas({
  b,
  set,
  vehiculo,
  setVehiculo,
  frase,
  autoSugerir,
}: SeccionProps & { vehiculo: string; setVehiculo: (v: string) => void; frase: string; autoSugerir: boolean }) {
  const [cargando, setCargando] = useState(false);
  const [vehiculoSug, setVehiculoSug] = useState<string | null>(null);
  const [nueva, setNueva] = useState("");

  async function sugerir() {
    if (!vehiculo.trim()) return;
    setCargando(true);
    try {
      const r = unwrap(await sugerirPiezas(vehiculo, frase));
      setVehiculoSug(r.vehiculo);
      if (!r.vehiculo) toast.error("No encontré ese carro en el catálogo");
      // Keep what is already chosen; add the rest unchecked.
      const ya = new Set(b.piezas.map((p) => p.busca));
      set({
        piezas: [
          ...b.piezas.map((p) => {
            const s = r.piezas.find((x) => x.busca === p.busca);
            return s ? { ...p, disponible: s.disponible, ejemplo: s.ejemplo } : p;
          }),
          ...r.piezas.filter((s) => !ya.has(s.busca)).map((s) => ({ ...s, incluida: false })),
        ],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron sugerir piezas");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (autoSugerir && ES_AUTOPARTES) sugerir();
    // Once, on entering the step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cambiar = (i: number, p: Partial<PiezaUI>) => set({ piezas: b.piezas.map((x, j) => (j === i ? { ...x, ...p } : x)) });

  function agregar() {
    const nombre = nueva.trim();
    if (nombre.length < 2) return;
    set({ piezas: [...b.piezas, { nombre, busca: normalize(nombre), cantidad: 1, por_lado: false, obligatoria: true, incluida: true }] });
    setNueva("");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 basis-60 text-sm text-foreground/80">
          {ES_AUTOPARTES ? (
            vehiculoSug ? (
              <>
                Piezas que manejas para <b>{vehiculoSug}</b>. Marca las que van en el juego.
              </>
            ) : (
              "Escribe un carro para sugerirte las piezas que manejas para él, o agrégalas a mano."
            )
          ) : (
            "Agrega cada pieza del juego como se llama en tu catálogo."
          )}
        </p>
      </div>
      {ES_AUTOPARTES && (
        <div className="flex gap-2">
          <span className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 focus-within:border-ring">
            <Car className="h-4 w-4 text-muted-foreground" />
            <input
              value={vehiculo}
              onChange={(e) => setVehiculo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), sugerir())}
              aria-label="Carro para sugerir piezas"
              placeholder="vento 2017"
              className="h-full w-0 min-w-0 flex-1 bg-transparent text-base outline-hidden lg:text-sm"
            />
          </span>
          <Button variant="secondary" className="h-11" loading={cargando} disabled={!vehiculo.trim()} onClick={sugerir}>
            Sugerir piezas
          </Button>
        </div>
      )}
      <div className="flex gap-2">
        <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 focus-within:border-ring">
          <Search className="h-4 w-4 text-muted-foreground" />
          <span className="sr-only">Agregar otra pieza</span>
          <input
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), agregar())}
            placeholder="Otra pieza: maza, resorte…"
            className="h-full w-0 min-w-0 flex-1 bg-transparent text-base outline-hidden lg:text-sm"
          />
        </label>
        <Button variant="secondary" className="h-11" disabled={nueva.trim().length < 2} onClick={agregar}>
          Agregar
        </Button>
      </div>
      {b.piezas.length > 0 && (
        <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border">
          {b.piezas.map((p, i) => (
            <li key={`${p.busca}-${i}`} className={cn("px-3 py-2.5", !p.incluida && "bg-muted/40")}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <input
                  type="checkbox"
                  checked={p.incluida}
                  onChange={(e) => cambiar(i, { incluida: e.target.checked })}
                  aria-label={p.nombre}
                  className="h-[18px] w-[18px] shrink-0 accent-brand"
                />
                <span className="min-w-0 flex-1 basis-48">
                  <span className={cn("block text-sm font-semibold", !p.incluida && "text-muted-foreground")}>{p.nombre}</span>
                  {p.ejemplo && (
                    <span className="block truncate text-xs text-muted-foreground">
                      <span className={p.disponible ? "font-semibold text-emerald-700 dark:text-emerald-400" : "font-semibold text-red-600 dark:text-red-400"}>
                        {p.disponible ? "✓ Hay" : "✕ Agotada"}
                      </span>{" "}
                      · {p.ejemplo}
                    </span>
                  )}
                </span>
                {p.incluida && (
                  <>
                    <Stepper valor={p.cantidad} onChange={(cantidad) => cambiar(i, { cantidad })} sufijo={p.por_lado ? "por lado" : undefined} />
                    <span className="inline-flex rounded-lg bg-muted p-0.5" role="group" aria-label="En el juego">
                      {[true, false].map((ob) => (
                        <button
                          key={String(ob)}
                          type="button"
                          aria-pressed={p.obligatoria === ob}
                          onClick={() => cambiar(i, { obligatoria: ob })}
                          className={cn(
                            "h-8 cursor-pointer rounded-md px-2.5 text-xs",
                            p.obligatoria === ob ? (ob ? "bg-brand font-semibold text-brand-foreground" : "bg-background font-semibold shadow-sm") : "text-muted-foreground",
                          )}
                        >
                          {ob ? "Obligatoria" : "Opcional"}
                        </button>
                      ))}
                    </span>
                  </>
                )}
              </div>
              {p.incluida && (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 pl-[30px]">
                  <label className="flex min-w-0 flex-1 basis-56 items-center gap-2 text-xs text-muted-foreground">
                    Se busca como
                    <input
                      value={p.busca}
                      onChange={(e) => cambiar(i, { busca: e.target.value })}
                      className="h-8 w-0 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-base text-foreground outline-hidden focus:border-ring lg:text-sm"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <input type="checkbox" checked={p.por_lado} onChange={(e) => cambiar(i, { por_lado: e.target.checked })} className="h-4 w-4 accent-brand" />
                    Va por lado (izquierda y derecha)
                  </label>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Opcional = el agente la ofrece aparte ("también tengo…"), no la mete al juego.</p>
    </div>
  );
}

function SeccionNombreJuego({ b, set }: SeccionProps) {
  return (
    <div className="space-y-5">
      <label className="block space-y-1.5">
        <Etiqueta>Nombre del juego</Etiqueta>
        <Input value={b.nombre} onChange={(e) => set({ nombre: e.target.value })} placeholder="Suspensión completa" />
      </label>
      <FrasesEditor frases={b.frases} onChange={(frases) => set({ frases })} titulo="Cuando el cliente diga…" />
    </div>
  );
}

function SeccionProbar({
  b,
  vehiculo,
  setVehiculo,
  autoProbar,
}: { b: Borrador; vehiculo: string; setVehiculo: (v: string) => void; autoProbar: boolean }) {
  const [prueba, setPrueba] = useState<JuegoArmado | null>(null);
  const [probando, setProbando] = useState(false);
  const incluidas = b.piezas.filter((p) => p.incluida);

  async function probar() {
    if (!vehiculo.trim() || !incluidas.length) return;
    setProbando(true);
    try {
      setPrueba(unwrap(await probarJuego(incluidas, vehiculo)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo probar");
    } finally {
      setProbando(false);
    }
  }

  useEffect(() => {
    if (autoProbar) probar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const obligatorias = prueba?.piezas.filter((p) => p.pieza.obligatoria) ?? [];
  const armadas = obligatorias.filter((p) => p.estado === "ok" && !p.soloLado).length;
  const sinPrecio = prueba?.piezas.some((p) => p.estado === "sin_precio");

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-xl border border-border bg-muted/40 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex-1 text-sm font-semibold">Probar con {ES_AUTOPARTES ? "un carro" : "un modelo"}</span>
          <span className="flex h-10 min-w-0 flex-1 basis-48 items-center gap-2 rounded-lg border border-border bg-background px-3 focus-within:border-ring">
            <Car className="h-4 w-4 text-muted-foreground" />
            <input
              value={vehiculo}
              onChange={(e) => setVehiculo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && probar()}
              aria-label="Vehículo de prueba"
              placeholder={ES_AUTOPARTES ? "vento 2017" : "iPhone 11 Pro Max"}
              className="h-full w-0 min-w-0 flex-1 bg-transparent text-base outline-hidden lg:text-sm"
            />
          </span>
          <Button variant="secondary" size="sm" className="h-10" loading={probando} disabled={!vehiculo.trim() || !incluidas.length} onClick={probar}>
            Probar
          </Button>
        </div>
        {prueba?.faltaVehiculo && <p className="text-sm text-red-600 dark:text-red-400">No encontré ese {ES_AUTOPARTES ? "carro" : "modelo"} en el catálogo.</p>}
        {prueba && !prueba.faltaVehiculo && (
          <>
            <ul className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border bg-background">
              {prueba.piezas.map((p, i) => {
                const ok = p.estado === "ok" && !p.soloLado;
                return (
                  <li key={i} className={cn("grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-sm", !ok && p.pieza.obligatoria && "bg-red-50 dark:bg-red-950/30")}>
                    <span aria-label={ok ? "Hay" : "No hay"} className={ok ? "font-bold text-emerald-700 dark:text-emerald-400" : "font-bold text-red-600 dark:text-red-400"}>
                      {ok ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">
                        {p.productos.length ? p.productos.map((x) => `${x.nombre} ×${x.qty}`).join(" + ") : p.pieza.nombre}
                      </span>
                      {!p.pieza.obligatoria && <span className="text-xs text-muted-foreground">opcional · la ofrece aparte</span>}
                    </span>
                    <span className={cn("text-right text-xs", ok ? "text-muted-foreground" : "font-semibold text-red-600 dark:text-red-400")}>
                      {p.soloLado
                        ? `Solo ${p.soloLado === "izq" ? "izquierda" : "derecha"}`
                        : p.estado === "no_hay"
                          ? "No la manejas"
                          : p.estado === "agotada"
                            ? "Agotada"
                            : p.estado === "sin_precio"
                              ? "Sin precio"
                              : formatMXN(Math.round(p.productos.reduce((t, x) => t + x.precio_mxn * x.qty, 0) * 100))}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="text-sm">
              <b>
                Para {prueba.vehiculo} arma {armadas} de {obligatorias.length} obligatorias.
              </b>{" "}
              {armadas < obligatorias.length && 'Las que faltan las anota en "Piden y no hay" y se lo dice al cliente.'}
            </p>
            {sinPrecio && (
              <p className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Hay piezas con precio $0 en el catálogo: sin precio no las cotiza, las pasa a un asesor.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SeccionSinonimo({ b, set, ejemploInicial }: SeccionProps & { ejemploInicial: string }) {
  const [ejemplo, setEjemplo] = useState(ejemploInicial);
  const [prueba, setPrueba] = useState<{ busca: string; resultados: ResultadoPrueba[] } | null>(null);
  const [probando, setProbando] = useState(false);

  async function probar() {
    if (!ejemplo.trim() || !b.nombre.trim()) return;
    setProbando(true);
    try {
      setPrueba(unwrap(await probarSinonimo(b.frases, b.nombre, ejemplo)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo probar");
    } finally {
      setProbando(false);
    }
  }

  return (
    <div className="space-y-5">
      <FrasesEditor frases={b.frases} onChange={(frases) => set({ frases })} titulo="El cliente dice…" />
      <label className="block space-y-1.5">
        <Etiqueta>…y en tu catálogo se llama</Etiqueta>
        <Input value={b.nombre} onChange={(e) => set({ nombre: e.target.value })} placeholder={ES_AUTOPARTES ? "balata" : "glass"} />
      </label>
      <div className="space-y-2.5 rounded-xl border border-border bg-muted/40 p-3.5">
        <div className="flex flex-wrap gap-2">
          <span className="flex h-10 min-w-0 flex-1 basis-56 items-center rounded-lg border border-border bg-background px-3 focus-within:border-ring">
            <input
              value={ejemplo}
              onChange={(e) => setEjemplo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && probar()}
              aria-label="Mensaje de prueba"
              placeholder={ES_AUTOPARTES ? "pastillas de tsuru 95" : "cuánto el cristal del 11 pro max"}
              className="h-full w-0 min-w-0 flex-1 bg-transparent text-base outline-hidden lg:text-sm"
            />
          </span>
          <Button variant="secondary" size="sm" className="h-10" loading={probando} disabled={!ejemplo.trim() || !b.nombre.trim()} onClick={probar}>
            Probar
          </Button>
        </div>
        {prueba && (
          <>
            <p className="text-xs text-muted-foreground">Así lo busca: "{prueba.busca}"</p>
            {prueba.resultados.length ? (
              <ul className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border bg-background">
                {prueba.resultados.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className={r.disponible ? "text-emerald-700 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                      {r.disponible ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{r.nombre}</span>
                    <b className="font-mono text-xs">{r.precio_mxn > 0 ? formatMXN(Math.round(r.precio_mxn * 100)) : "sin precio"}</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-red-600 dark:text-red-400">No encontró nada: revisa cómo se llama en tu catálogo.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SeccionNota({ b, set }: SeccionProps) {
  return (
    <div className="space-y-4">
      <label className="block space-y-1.5">
        <Etiqueta>Título</Etiqueta>
        <Input value={b.nombre} onChange={(e) => set({ nombre: e.target.value })} placeholder="Delantero o trasero" />
      </label>
      <label className="block space-y-1.5">
        <Etiqueta>La regla</Etiqueta>
        <textarea
          value={b.texto}
          onChange={(e) => set({ texto: e.target.value.slice(0, 400) })}
          rows={4}
          placeholder="Si no dice si es delantero o trasero, pregúntale antes de cotizar."
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base outline-hidden focus:border-ring lg:text-sm"
        />
        <span className="block text-right text-xs text-muted-foreground">{b.texto.length}/400</span>
      </label>
    </div>
  );
}

function FrasesEditor({ frases, onChange, titulo }: { frases: string[]; onChange: (f: string[]) => void; titulo: string | null }) {
  const [nueva, setNueva] = useState("");
  if (titulo === null) return null;
  function agregar() {
    const f = nueva.trim().toLowerCase();
    if (f.length >= 2 && !frases.includes(f)) onChange([...frases, f]);
    setNueva("");
  }
  return (
    <div className="space-y-2">
      <Etiqueta>{titulo}</Etiqueta>
      <div className="flex flex-wrap gap-2">
        {frases.map((f) => (
          <span key={f} className="inline-flex h-8 items-center gap-1 rounded-full bg-muted pr-1 pl-3 text-sm">
            {f}
            <button
              type="button"
              aria-label={`Quitar ${f}`}
              onClick={() => onChange(frases.filter((x) => x !== f))}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-background"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <input
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              agregar();
            }
          }}
          onBlur={agregar}
          aria-label="Otra forma de decirlo"
          placeholder="+ Otra forma de decirlo"
          className="h-8 min-w-40 rounded-full border border-dashed border-foreground/30 bg-background px-3 text-base outline-hidden focus:border-ring lg:text-sm"
        />
      </div>
    </div>
  );
}

export { NOMBRE_TIPO };
