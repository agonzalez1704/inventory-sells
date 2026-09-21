"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPin, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unwrap } from "@/lib/errors";
import { activarEquipo, estadoCheckin, registrarCheckin, registrarCheckinEquipo } from "./actions";

// This computer's pairing with its branch (see sucursal_equipos). Per device.
const LS_EQUIPO = "sucursal_equipo_v1";
const leerToken = () => {
  try {
    return localStorage.getItem(LS_EQUIPO);
  } catch {
    return null;
  }
};

/**
 * The start-of-day gate for employees tied to branches. It renders NOTHING for
 * everyone else (admins, unassigned staff) and nothing while it checks — the
 * app must never flash a lock at people it doesn't apply to. When it does
 * apply and today has no check-in, a full-screen overlay asks for the
 * browser's location and registers where the employee actually is.
 */
export function SucursalGate() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [permitidas, setPermitidas] = useState<string[]>([]);
  const [pidiendo, setPidiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [vinculando, setVinculando] = useState(false);

  function listo(sucursal: string) {
    toast.success(`Día iniciado en ${sucursal}`);
    setAbierto(false);
    // Pages behind the overlay rendered before the check-in (branch locks).
    router.refresh();
  }

  useEffect(() => {
    let on = true;
    estadoCheckin()
      .then(async (e) => {
        if (!on) return;
        if (!(e.requiere && !e.sucursal)) return;
        // A paired counter computer vouches for its branch: no overlay at all.
        const token = leerToken();
        if (token) {
          const r = await registrarCheckinEquipo(token);
          if (!on) return;
          if (r.ok) return listo(r.data.sucursal);
          try {
            localStorage.removeItem(LS_EQUIPO);
          } catch {}
        }
        setPermitidas(e.permitidas);
        setAbierto(true);
      })
      // A failed status read must not lock the shop out of its own register.
      .catch(() => {});
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!abierto) return null;

  function compartir() {
    if (!navigator.geolocation) {
      setError("Este navegador no puede compartir tu ubicación.");
      return;
    }
    setPidiendo(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = unwrap(
            await registrarCheckin(
              pos.coords.latitude,
              pos.coords.longitude,
              pos.coords.accuracy,
            ),
          );
          listo(r.sucursal);
        } catch (e) {
          setError(e instanceof Error ? e.message : "No se pudo registrar");
        } finally {
          setPidiendo(false);
        }
      },
      (err) => {
        setPidiendo(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Permite el acceso a tu ubicación en el navegador para iniciar el día."
            : "No se pudo leer tu ubicación. Intenta de nuevo.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center bg-background/95 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-lg">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand-foreground">
          <MapPin className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">
          Inicia tu día en sucursal
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Comparte tu ubicación para confirmar que estás en{" "}
          {permitidas.length === 1
            ? permitidas[0]
            : `alguna de tus sucursales (${permitidas.join(", ")})`}
          .
        </p>
        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}
        <Button className="mt-4 w-full" onClick={compartir} loading={pidiendo}>
          <MapPin className="h-4 w-4" />
          Compartir mi ubicación
        </Button>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Se registra una vez al día: sucursal, hora y distancia.
        </p>

        {/* A desktop has no GPS and reads hundreds of meters off: the counter
            computer is paired once with an admin's code instead. */}
        <div className="mt-5 border-t border-border pt-4 text-left">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Monitor className="h-4 w-4" />
            ¿Es la computadora del mostrador?
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pide al administrador un código de 6 dígitos (Configuración → Sucursales). Se captura una sola vez.
          </p>
          <div className="mt-2 flex gap-2">
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="123456"
              className="font-mono tracking-widest"
            />
            <Button
              variant="secondary"
              loading={vinculando}
              disabled={codigo.length !== 6}
              onClick={async () => {
                setVinculando(true);
                setError(null);
                try {
                  const a = unwrap(await activarEquipo(codigo));
                  try {
                    localStorage.setItem(LS_EQUIPO, a.token);
                  } catch {}
                  const r = unwrap(await registrarCheckinEquipo(a.token));
                  listo(r.sucursal);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "No se pudo vincular");
                } finally {
                  setVinculando(false);
                }
              }}
            >
              Vincular
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
