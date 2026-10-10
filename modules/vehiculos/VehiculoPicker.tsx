"use client";

import { useEffect, useState } from "react";
import { Car, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  aniosDeModelo,
  buscarModelos,
  versionesDeModelo,
  type ModeloVehiculo,
  type Vehiculo,
  type VersionVehiculo,
} from "./actions";

const LS_RECIENTES = "vehiculos_recientes_v1";

const mismo = (a: Vehiculo, b: Vehiculo) =>
  a.marca === b.marca && a.modelo === b.modelo && a.anio === b.anio && (a.version ?? null) === (b.version ?? null);

function leerRecientes(): Vehiculo[] {
  try {
    const v = localStorage.getItem(LS_RECIENTES);
    return v ? (JSON.parse(v) as Vehiculo[]) : [];
  } catch {
    return [];
  }
}

export function guardarReciente(v: Vehiculo): void {
  try {
    const previos = leerRecientes().filter((x) => !mismo(x, v));
    localStorage.setItem(LS_RECIENTES, JSON.stringify([v, ...previos].slice(0, 6)));
  } catch {
    // Blocked storage: the picker still works, it just forgets.
  }
}

export const nombreVehiculo = (v: Vehiculo) =>
  [v.marca, v.modelo, v.version, v.anio].filter(Boolean).join(" ");

const aniosDeVersion = (v: VersionVehiculo) =>
  v.anio_min && v.anio_max && v.anio_min !== v.anio_max
    ? `${v.anio_min}–${v.anio_max}`
    : (v.anio_min ?? v.anio_max ?? "").toString();

/**
 * "¿Qué carro trae?" — the model, the year, and the version only when that
 * year has more than one.
 *
 * The make is not asked for: the counter says "un Versa", and model names are
 * nearly unique across the catalog, so the make rides along as context instead
 * of costing a tap on every sale.
 *
 * What comes second is whatever the shop has named. "Hay Versa V-Drive y hay
 * Versa segunda generación": where someone named the generations, the version
 * is the second tap and it already pins the years. Where nobody has, the year
 * grid does the same job, as before.
 */
export function VehiculoPicker({
  onElegir,
  onCancelar,
  compacto = false,
}: {
  onElegir: (v: Vehiculo) => void;
  onCancelar?: () => void;
  /** Inside a drawer on a phone: no card frame of its own. */
  compacto?: boolean;
}) {
  const [q, setQ] = useState("");
  const [modelos, setModelos] = useState<ModeloVehiculo[]>([]);
  const [elegido, setElegido] = useState<ModeloVehiculo | null>(null);
  const [versiones, setVersiones] = useState<VersionVehiculo[]>([]);
  const [anios, setAnios] = useState<{ anio: number; piezas: number }[]>([]);
  // The year picked when that year has two or more versions to choose from.
  const [anioDudoso, setAnioDudoso] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [recientes, setRecientes] = useState<Vehiculo[]>([]);

  useEffect(() => {
    setRecientes(leerRecientes());
  }, []);

  // Debounced: typing "versa" costs one query, not five.
  useEffect(() => {
    if (elegido) return;
    let vivo = true;
    setCargando(true);
    const t = setTimeout(() => {
      buscarModelos(q)
        .then((r) => vivo && setModelos(r))
        .catch(() => vivo && setModelos([]))
        .finally(() => vivo && setCargando(false));
    }, 180);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [q, elegido]);

  // Both lists at once: which step to show depends on whether the model has
  // named versions, and the year grid is needed either way.
  useEffect(() => {
    if (!elegido) return;
    let vivo = true;
    setCargando(true);
    setAnioDudoso(null);
    Promise.all([
      versionesDeModelo(elegido.marca, elegido.modelo).catch(() => []),
      aniosDeModelo(elegido.marca, elegido.modelo).catch(() => []),
    ])
      .then(([vs, as]) => {
        if (!vivo) return;
        setVersiones(vs);
        setAnios(as);
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [elegido]);

  function elegir(v: Vehiculo) {
    guardarReciente(v);
    onElegir(v);
  }

  const nombradas = versiones.filter((v) => v.version);
  // Marca → Modelo → Año, and the version only when that year is ambiguous:
  // a Versa 2015 is a V-Drive, a Versa 2021 can be V-Drive or 2ª generación.
  const versionesDe = (anio: number) =>
    nombradas.filter((v) => (v.anio_min ?? -Infinity) <= anio && anio <= (v.anio_max ?? Infinity));
  const pasoVersion = anioDudoso !== null;

  function elegirAnio(anio: number) {
    if (!elegido) return;
    if (versionesDe(anio).length >= 2) setAnioDudoso(anio);
    else elegir({ marca: elegido.marca, modelo: elegido.modelo, anio });
  }

  return (
    <div className={cn("flex flex-col gap-4", !compacto && "rounded-2xl border border-border bg-background p-5")}>
      <div className="flex flex-wrap items-center gap-2">
        <Car className="h-5 w-5 text-brand-foreground" />
        <span className="text-lg font-semibold">¿Qué carro trae?</span>
        <div className="flex-1" />
        {onCancelar && (
          <Button variant="ghost" size="sm" onClick={onCancelar}>
            <X className="h-4 w-4" />
            Cerrar
          </Button>
        )}
      </div>

      {!elegido ? (
        <>
          {/* shadcn's combobox, like the store's vehicle filter: type "vers"
              and Versa is there; the list opens on focus with the models
              this shop stocks most. The server already filters, so the
              combobox does not filter again. */}
          <Combobox
            items={modelos}
            value={null}
            onValueChange={(m) => m && setElegido(m as ModeloVehiculo)}
            inputValue={q}
            onInputValueChange={(v) => setQ(v)}
            filter={null}
            itemToStringLabel={(m: ModeloVehiculo) => m.modelo}
            isItemEqualToValue={(a: ModeloVehiculo, b: ModeloVehiculo) => a.marca === b.marca && a.modelo === b.modelo}
            autoHighlight
            openOnInputClick
          >
            <ComboboxInput
              autoFocus
              aria-label="Modelo del carro"
              placeholder="Escribe el modelo: versa, aveo, jetta…"
              className="h-12"
            >
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            </ComboboxInput>
            <ComboboxContent>
              <ComboboxEmpty>{cargando ? "Buscando modelos…" : `Ningún modelo coincide con «${q.trim()}».`}</ComboboxEmpty>
              <ComboboxList>
                {(m: ModeloVehiculo) => (
                  <ComboboxItem key={`${m.marca}-${m.modelo}`} value={m} className="h-auto py-2 lg:h-auto">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate font-semibold">{m.modelo}</span>
                        <span className="truncate text-xs text-muted-foreground">{m.marca}</span>
                      </span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {m.anio_min && m.anio_max ? `${m.anio_min}–${m.anio_max} · ` : ""}
                        {m.piezas} {m.piezas === 1 ? "pieza" : "piezas"}
                      </span>
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>

          {recientes.length > 0 && !q.trim() && (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-sm font-medium">Carros de hoy</p>
              <div className="flex flex-wrap gap-2">
                {recientes.map((v) => (
                  <button
                    key={nombreVehiculo(v)}
                    type="button"
                    onClick={() => onElegir(v)}
                    className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full border border-border px-4 text-sm hover:bg-muted"
                  >
                    <Check className="h-3.5 w-3.5 text-muted-foreground" />
                    {nombreVehiculo(v)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { setElegido(null); setQ(""); }}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-4 text-sm hover:bg-muted"
            >
              <span className="font-semibold">{elegido.modelo}</span>
              <span className="text-muted-foreground">{elegido.marca}</span>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            {anioDudoso !== null && (
              <button
                type="button"
                onClick={() => setAnioDudoso(null)}
                className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold tabular-nums hover:bg-muted"
              >
                {anioDudoso}
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
            <span className="text-sm text-muted-foreground">{pasoVersion ? "¿Qué versión?" : "¿De qué año?"}</span>
          </div>

          {pasoVersion ? (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {versionesDe(anioDudoso ?? 0).map((v) => (
                  <button
                    key={v.version}
                    type="button"
                    onClick={() =>
                      elegir({ marca: elegido.marca, modelo: elegido.modelo, anio: anioDudoso, version: v.version })
                    }
                    className="flex cursor-pointer flex-col gap-0.5 rounded-xl border border-border px-3 py-2.5 text-left hover:border-primary hover:bg-muted"
                  >
                    <span className="truncate font-semibold">{v.version}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {aniosDeVersion(v) && `${aniosDeVersion(v)} · `}
                      {v.piezas} {v.piezas === 1 ? "pieza" : "piezas"}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => elegir({ marca: elegido.marca, modelo: elegido.modelo, anio: anioDudoso })}
                className="cursor-pointer self-start text-sm font-medium text-brand-foreground underline-offset-4 hover:underline"
              >
                No sé la versión: ver todas las de {anioDudoso}
              </button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {cargando && anios.length === 0 ? (
                  <p className="col-span-full py-6 text-center text-sm text-muted-foreground">Cargando años…</p>
                ) : anios.length === 0 ? (
                  <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
                    No hay piezas registradas para ese modelo.
                  </p>
                ) : (
                  anios.map((a) => (
                    <button
                      key={a.anio}
                      type="button"
                      onClick={() => elegirAnio(a.anio)}
                      className="flex h-12 cursor-pointer flex-col items-center justify-center rounded-xl border border-border text-sm hover:border-primary hover:bg-muted"
                    >
                      <span className="font-semibold tabular-nums">{a.anio}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">{a.piezas}</span>
                    </button>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                El año elige la generación: un {elegido.modelo} 2013 no trae las piezas de la generación anterior.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
