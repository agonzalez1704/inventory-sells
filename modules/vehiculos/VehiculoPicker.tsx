"use client";

import { useEffect, useRef, useState } from "react";
import { Car, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  `${v.marca} ${v.modelo} ${v.version ?? v.anio ?? ""}`.trim();

const aniosDeVersion = (v: VersionVehiculo) =>
  v.anio_min && v.anio_max && v.anio_min !== v.anio_max
    ? `${v.anio_min}–${v.anio_max}`
    : (v.anio_min ?? v.anio_max ?? "").toString();

/**
 * "¿Qué carro trae?" — the model, then the version or the year.
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
  const [porAnio, setPorAnio] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [recientes, setRecientes] = useState<Vehiculo[]>([]);
  const buscador = useRef<HTMLInputElement>(null);

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
    setPorAnio(false);
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
  const pasoVersion = !porAnio && nombradas.length > 0;

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
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={buscador}
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Escribe el modelo: versa, aveo, jetta…"
              className="h-12 pl-9 text-base"
            />
          </div>

          <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-3">
            {cargando && modelos.length === 0 ? (
              <p className="col-span-full py-6 text-center text-sm text-muted-foreground">Buscando modelos…</p>
            ) : modelos.length === 0 ? (
              <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
                Ningún modelo coincide con «{q.trim()}».
              </p>
            ) : (
              modelos.map((m) => (
                <button
                  key={`${m.marca}-${m.modelo}`}
                  type="button"
                  onClick={() => setElegido(m)}
                  className="flex cursor-pointer flex-col gap-0.5 rounded-xl border border-border px-3 py-2.5 text-left hover:border-primary hover:bg-muted"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="truncate font-semibold">{m.modelo}</span>
                    <span className="truncate text-xs text-muted-foreground">{m.marca}</span>
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {m.anio_min && m.anio_max ? `${m.anio_min}–${m.anio_max} · ` : ""}
                    {m.piezas} {m.piezas === 1 ? "pieza" : "piezas"}
                  </span>
                </button>
              ))
            )}
          </div>

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
              onClick={() => setElegido(null)}
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-4 text-sm hover:bg-muted"
            >
              <span className="font-semibold">{elegido.modelo}</span>
              <span className="text-muted-foreground">{elegido.marca}</span>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <span className="text-sm text-muted-foreground">{pasoVersion ? "¿Qué versión?" : "¿De qué año?"}</span>
          </div>

          {pasoVersion ? (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {nombradas.map((v) => (
                  <button
                    key={v.version}
                    type="button"
                    onClick={() =>
                      elegir({ marca: elegido.marca, modelo: elegido.modelo, anio: null, version: v.version })
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
                onClick={() => setPorAnio(true)}
                className="cursor-pointer self-start text-sm font-medium text-brand-foreground underline-offset-4 hover:underline"
              >
                No sé la versión, buscar por año
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
                      onClick={() => elegir({ marca: elegido.marca, modelo: elegido.modelo, anio: a.anio })}
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
