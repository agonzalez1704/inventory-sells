"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Car, Check, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aniosDeModelo, marcasDeVehiculo, modelosDeMarca, type Vehiculo } from "./actions";

const LS_RECIENTES = "vehiculos_recientes_v1";

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
    const previos = leerRecientes().filter(
      (x) => !(x.marca === v.marca && x.modelo === v.modelo && x.anio === v.anio),
    );
    localStorage.setItem(LS_RECIENTES, JSON.stringify([v, ...previos].slice(0, 6)));
  } catch {
    // Blocked storage: the picker still works, it just forgets.
  }
}

export const nombreVehiculo = (v: Vehiculo) => `${v.marca} ${v.modelo} ${v.anio}`;

/**
 * "¿Qué carro trae?" — make, model, year, in that order.
 *
 * Each step is a searchable list, because Ruli carries 75 makes and 1,549
 * models: a plain dropdown of that is a scroll, not a choice. The year is a
 * grid — the counter knows the year and taps it — and only the years the shop
 * actually has parts for are offered.
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
  const [marca, setMarca] = useState<string | null>(null);
  const [modelo, setModelo] = useState<string | null>(null);
  const [marcas, setMarcas] = useState<{ marca: string; piezas: number }[]>([]);
  const [modelos, setModelos] = useState<{ modelo: string; piezas: number }[]>([]);
  const [anios, setAnios] = useState<{ anio: number; piezas: number }[]>([]);
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(true);
  const [recientes, setRecientes] = useState<Vehiculo[]>([]);
  const buscador = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecientes(leerRecientes());
    marcasDeVehiculo()
      .then(setMarcas)
      .catch(() => setMarcas([]))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    if (!marca) return;
    setCargando(true);
    modelosDeMarca(marca)
      .then(setModelos)
      .catch(() => setModelos([]))
      .finally(() => setCargando(false));
  }, [marca]);

  useEffect(() => {
    if (!marca || !modelo) return;
    setCargando(true);
    aniosDeModelo(marca, modelo)
      .then(setAnios)
      .catch(() => setAnios([]))
      .finally(() => setCargando(false));
  }, [marca, modelo]);

  // Typing filters whichever step is open.
  const paso: "marca" | "modelo" | "anio" = !marca ? "marca" : !modelo ? "modelo" : "anio";
  useEffect(() => {
    setQ("");
    buscador.current?.focus();
  }, [paso]);

  const texto = q.trim().toLowerCase();
  const listaMarcas = useMemo(
    () => (texto ? marcas.filter((m) => m.marca.toLowerCase().includes(texto)) : marcas),
    [marcas, texto],
  );
  const listaModelos = useMemo(
    () => (texto ? modelos.filter((m) => m.modelo.toLowerCase().includes(texto)) : modelos),
    [modelos, texto],
  );

  function elegirAnio(anio: number) {
    if (!marca || !modelo) return;
    const v = { marca, modelo, anio };
    guardarReciente(v);
    onElegir(v);
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

      {/* migas: cada paso elegido vuelve a abrirse con un toque */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => {
            setMarca(null);
            setModelo(null);
          }}
          className={cn(
            "h-10 cursor-pointer rounded-full border px-4",
            marca ? "border-border bg-muted/40" : "border-primary bg-primary text-primary-foreground",
          )}
        >
          {marca ?? "1 · Marca"}
        </button>
        <button
          type="button"
          disabled={!marca}
          onClick={() => setModelo(null)}
          className={cn(
            "h-10 cursor-pointer rounded-full border px-4 disabled:cursor-default disabled:opacity-40",
            modelo
              ? "border-border bg-muted/40"
              : marca
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border",
          )}
        >
          {modelo ?? "2 · Modelo"}
        </button>
        <span
          className={cn(
            "flex h-10 items-center rounded-full border px-4",
            paso === "anio" ? "border-primary bg-primary text-primary-foreground" : "border-border",
          )}
        >
          3 · Año
        </span>
      </div>

      {paso !== "anio" && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={buscador}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={paso === "marca" ? "Busca la marca…" : `Busca el modelo de ${marca}…`}
            className="h-11 pl-9"
          />
        </div>
      )}

      <div className="min-h-32">
        {paso === "marca" && (
          <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
            {cargando && marcas.length === 0 ? (
              <p className="col-span-full py-6 text-center text-sm text-muted-foreground">Cargando marcas…</p>
            ) : listaMarcas.length === 0 ? (
              <p className="col-span-full py-6 text-center text-sm text-muted-foreground">Ninguna marca coincide.</p>
            ) : (
              listaMarcas.map((m) => (
                <button
                  key={m.marca}
                  type="button"
                  onClick={() => setMarca(m.marca)}
                  className="flex h-12 cursor-pointer items-center justify-between gap-2 rounded-xl border border-border px-3 text-left text-sm hover:bg-muted"
                >
                  <span className="truncate font-medium">{m.marca}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{m.piezas}</span>
                </button>
              ))
            )}
          </div>
        )}

        {paso === "modelo" && (
          <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
            {cargando && modelos.length === 0 ? (
              <p className="col-span-full py-6 text-center text-sm text-muted-foreground">Cargando modelos…</p>
            ) : listaModelos.length === 0 ? (
              <p className="col-span-full py-6 text-center text-sm text-muted-foreground">Ningún modelo coincide.</p>
            ) : (
              listaModelos.map((m) => (
                <button
                  key={m.modelo}
                  type="button"
                  onClick={() => setModelo(m.modelo)}
                  className="flex h-12 cursor-pointer items-center justify-between gap-2 rounded-xl border border-border px-3 text-left text-sm hover:bg-muted"
                >
                  <span className="truncate font-medium">{m.modelo}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{m.piezas}</span>
                </button>
              ))
            )}
          </div>
        )}

        {paso === "anio" && (
          <div className="space-y-2">
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
              El año filtra por la generación registrada, no por el texto del nombre.
            </p>
          </div>
        )}
      </div>

      {recientes.length > 0 && paso === "marca" && (
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
    </div>
  );
}
