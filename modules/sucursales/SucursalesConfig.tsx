"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPin, Plus, Archive, Crosshair } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrap } from "@/lib/errors";
import { crearSucursal, archivarSucursal, type Sucursal } from "./actions";

/**
 * Branch management, built for how a branch is actually registered: the admin
 * STANDS at the counter and presses "Usar mi ubicación" — the coordinates are
 * the phone's, not something anyone types.
 */
export function SucursalesConfig({ sucursales }: { sucursales: Sucursal[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nombre, setNombre] = useState("");
  const [radio, setRadio] = useState("300");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [remoto, setRemoto] = useState("");

  // Registering without standing there: paste "lat, lng" or a full Google Maps
  // URL. Precedence mirrors how exact each form is: the dropped pin
  // (!3d…!4d…), then the q= search target, then the @viewport center, then a
  // bare decimal pair. Short share links (maps.app.goo.gl) carry no
  // coordinates — the hint says to open them first.
  function parseCoords(texto: string): { lat: number; lng: number } | null {
    const t = texto.trim();
    if (!t) return null;
    const patrones = [
      /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,
      /[?&]q=(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,
      /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,
      /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/,
    ];
    for (const re of patrones) {
      const m = t.match(re);
      if (!m) continue;
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
    return null;
  }

  function onRemoto(v: string) {
    setRemoto(v);
    const c = parseCoords(v);
    if (c) {
      setCoords(c);
      toast.success(`Coordenadas capturadas: ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`);
    } else if (v.trim() && /goo\.gl|maps\.app/.test(v)) {
      toast.error("Ese link corto no trae coordenadas: ábrelo en el navegador y copia la URL completa");
    }
  }

  function ubicarme() {
    if (!navigator.geolocation) return toast.error("Este navegador no da ubicación");
    setLeyendo(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLeyendo(false);
        toast.success(`Ubicación capturada (±${Math.round(pos.coords.accuracy)} m)`);
      },
      () => {
        setLeyendo(false);
        toast.error("No se pudo leer la ubicación — revisa el permiso del navegador");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function crear() {
    if (!coords) return toast.error("Falta la ubicación: usa el botón o pega un link de Maps");
    start(async () => {
      try {
        unwrap(
          await crearSucursal({
            nombre,
            lat: coords.lat,
            lng: coords.lng,
            radioM: parseInt(radio, 10) || 300,
          }),
        );
        toast.success(`Sucursal "${nombre.trim()}" registrada`);
        setNombre("");
        setCoords(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo crear");
      }
    });
  }

  function archivar(s: Sucursal) {
    start(async () => {
      try {
        unwrap(await archivarSucursal(s.id));
        toast.success(`"${s.nombre}" archivada`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo archivar");
      }
    });
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
          <MapPin className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Sucursales</h2>
          <p className="text-xs text-muted-foreground">
            En Usuarios asignas quién trabaja en cuál; al abrir la app se les
            pide ubicación y queda registrado su inicio de día.
          </p>
        </div>
      </div>

      {sucursales.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
          {sucursales.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{s.nombre}</span>
                <span className="block text-xs text-muted-foreground">
                  radio {s.radio_m} m
                </span>
              </span>
              <button
                type="button"
                onClick={() => archivar(s)}
                disabled={pending}
                aria-label={`Archivar ${s.nombre}`}
                className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600"
              >
                <Archive className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block min-w-40 flex-1">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Nombre</span>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Panorama" />
        </label>
        <label className="block w-24">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Radio (m)</span>
          <Input value={radio} onChange={(e) => setRadio(e.target.value)} inputMode="numeric" />
        </label>
        <Button type="button" variant="secondary" onClick={ubicarme} loading={leyendo}>
          <Crosshair className="h-4 w-4" />
          {coords ? "Ubicación lista ✓" : "Usar mi ubicación"}
        </Button>
        <Button type="button" onClick={crear} loading={pending} disabled={!nombre.trim() || !coords}>
          <Plus className="h-4 w-4" />
          Agregar
        </Button>
      </div>
      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-muted-foreground">
          Sin estar ahí: pega un link de Google Maps o coordenadas
        </span>
        <Input
          value={remoto}
          onChange={(e) => onRemoto(e.target.value)}
          placeholder="https://www.google.com/maps/place/… o 21.12184, -101.68213"
        />
      </label>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Parado en el mostrador usa &quot;Usar mi ubicación&quot;. A distancia:
        busca la sucursal en Google Maps, ponle el pin y copia la URL del
        navegador (un link corto compartido no trae coordenadas — ábrelo
        primero).
      </p>
    </Card>
  );
}
