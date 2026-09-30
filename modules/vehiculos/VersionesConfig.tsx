"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Car, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buscarModelos,
  nombrarVersion,
  rangosDeModelo,
  type ModeloVehiculo,
  type RangoVehiculo,
} from "./actions";

const clave = (r: RangoVehiculo) => `${r.anio_desde ?? ""}-${r.anio_hasta ?? ""}`;

const anios = (r: RangoVehiculo) =>
  r.anio_desde === null
    ? "Sin año"
    : r.anio_hasta === null || r.anio_hasta === r.anio_desde
      ? `${r.anio_desde}`
      : `${r.anio_desde}–${r.anio_hasta}`;

/**
 * Naming the generations, one model at a time.
 *
 * The price list carries make, model and a year range, never a generation, so
 * the name has to be typed by someone who knows the cars: a band like
 * "Versa 2007–2023" covers two generations and no rule can tell them apart.
 * Whatever is named here becomes the version step in the register's search.
 */
export function VersionesConfig() {
  const [q, setQ] = useState("");
  const [modelos, setModelos] = useState<ModeloVehiculo[]>([]);
  const [elegido, setElegido] = useState<ModeloVehiculo | null>(null);
  const [rangos, setRangos] = useState<RangoVehiculo[]>([]);
  const [nombres, setNombres] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (elegido || !q.trim()) {
      setModelos([]);
      return;
    }
    let vivo = true;
    const t = setTimeout(() => {
      buscarModelos(q)
        .then((r) => vivo && setModelos(r))
        .catch(() => vivo && setModelos([]));
    }, 180);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [q, elegido]);

  useEffect(() => {
    if (!elegido) return;
    let vivo = true;
    setCargando(true);
    rangosDeModelo(elegido.marca, elegido.modelo)
      .then((rs) => {
        if (!vivo) return;
        setRangos(rs);
        setNombres(Object.fromEntries(rs.map((r) => [clave(r), r.version ?? ""])));
      })
      .catch(() => vivo && setRangos([]))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [elegido]);

  async function guardar(r: RangoVehiculo) {
    if (!elegido) return;
    const k = clave(r);
    setGuardando(k);
    const res = await nombrarVersion({
      marca: elegido.marca,
      modelo: elegido.modelo,
      anioDesde: r.anio_desde,
      anioHasta: r.anio_hasta,
      version: nombres[k] ?? "",
    });
    setGuardando(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setRangos((prev) => prev.map((x) => (clave(x) === k ? { ...x, version: nombres[k] || null } : x)));
    toast.success(
      nombres[k]?.trim()
        ? `${anios(r)} es ahora «${nombres[k].trim()}» en ${res.data.etiquetas} etiquetas`
        : `${anios(r)} quedó sin versión`,
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
          <Car className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Versiones de vehículo</h2>
          <p className="text-xs text-muted-foreground">
            Ponle nombre a cada generación («V-Drive», «2ª generación»). Lo que
            nombres aquí aparece como paso de versión en el punto de venta.
          </p>
        </div>
      </div>

      {!elegido ? (
        <div className="mt-3 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Busca el modelo: versa, aveo, jetta…"
              className="pl-9"
            />
          </div>
          {modelos.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {modelos.map((m) => (
                <button
                  key={`${m.marca}-${m.modelo}`}
                  type="button"
                  onClick={() => setElegido(m)}
                  className="flex cursor-pointer flex-col gap-0.5 rounded-xl border border-border px-3 py-2 text-left hover:border-primary hover:bg-muted"
                >
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-semibold">{m.modelo}</span>
                    <span className="truncate text-xs text-muted-foreground">{m.marca}</span>
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {m.piezas} {m.piezas === 1 ? "pieza" : "piezas"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">
              {elegido.modelo} <span className="font-normal text-muted-foreground">{elegido.marca}</span>
            </p>
            <div className="flex-1" />
            <Button variant="secondary" size="sm" onClick={() => { setElegido(null); setQ(""); }}>
              Otro modelo
            </Button>
          </div>

          {cargando ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Cargando rangos…</p>
          ) : rangos.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Ese modelo no tiene rangos de año registrados.
            </p>
          ) : (
            <ul className="space-y-2">
              {rangos.map((r) => {
                const k = clave(r);
                const sucio = (nombres[k] ?? "") !== (r.version ?? "");
                return (
                  <li key={k} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2">
                    <span className="w-24 shrink-0 text-sm font-semibold tabular-nums">{anios(r)}</span>
                    <span className="w-28 shrink-0 text-xs text-muted-foreground tabular-nums">
                      {r.piezas} {r.piezas === 1 ? "pieza" : "piezas"} · {r.etiquetas} etiq.
                    </span>
                    <Input
                      value={nombres[k] ?? ""}
                      onChange={(e) => setNombres((p) => ({ ...p, [k]: e.target.value }))}
                      placeholder="Sin nombre"
                      className="h-9 min-w-40 flex-1"
                    />
                    <Button
                      size="sm"
                      className="h-9"
                      disabled={!sucio || guardando === k}
                      onClick={() => guardar(r)}
                    >
                      {guardando === k ? "Guardando…" : "Guardar"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
