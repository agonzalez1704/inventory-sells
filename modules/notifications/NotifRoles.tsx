"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/errors";
import type { NotifKind } from "@/lib/push";
import { setNotifRol, type NotifRol } from "./rol-actions";

const EVENTOS: { key: NotifKind; label: string; desc: string }[] = [
  { key: "venta", label: "Ventas", desc: "Cada venta nueva" },
  { key: "fiado", label: "Notas de crédito", desc: "Cada nota de crédito nueva" },
  { key: "abono", label: "Abonos y cobros", desc: "Pagos a una nota de crédito" },
  { key: "cancelacion", label: "Cancelaciones", desc: "Ventas anuladas y devoluciones" },
  {
    key: "garantia",
    label: "Garantías por aprobar",
    desc: "Un vendedor reportó una y espera decisión",
  },
];

/**
 * Who gets told what, by role.
 *
 * Per role rather than per person: staff change, roles do not, and the point of
 * a notification is that whoever holds a job hears about it — not whoever
 * remembered to tick a box.
 */
export function NotifRoles({ inicial }: { inicial: NotifRol[] }) {
  const [roles, setRoles] = useState(inicial);
  const [pending, start] = useTransition();

  function alternar(roleId: string, kind: NotifKind, activo: boolean) {
    // Optimistic: a checkbox that waits on the network feels broken.
    setRoles((rs) =>
      rs.map((r) =>
        r.role_id === roleId
          ? { ...r, kinds: activo ? [...r.kinds, kind] : r.kinds.filter((k) => k !== kind) }
          : r,
      ),
    );
    start(async () => {
      try {
        unwrap(await setNotifRol(roleId, kind, activo));
      } catch (e) {
        // Put it back: a switch left where it failed to save means the next
        // reload silently contradicts it.
        setRoles((rs) =>
          rs.map((r) =>
            r.role_id === roleId
              ? { ...r, kinds: activo ? r.kinds.filter((k) => k !== kind) : [...r.kinds, kind] }
              : r,
          ),
        );
        toast.error(e instanceof Error ? e.message : "No se pudo guardar");
      }
    });
  }

  return (
    <div className="space-y-4">
      {EVENTOS.map((ev) => (
        <div key={ev.key}>
          <p className="text-sm font-medium">{ev.label}</p>
          <p className="text-xs text-muted-foreground">{ev.desc}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {roles.map((r) => {
              const on = r.kinds.includes(ev.key);
              return (
                <button
                  key={r.role_id}
                  type="button"
                  disabled={pending}
                  onClick={() => alternar(r.role_id, ev.key, !on)}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    on
                      ? "border-accent bg-accent text-white"
                      : "border-border bg-background text-muted-foreground hover:border-ring/40 hover:text-foreground",
                    pending && "opacity-70",
                  )}
                >
                  {r.rol}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Marca qué roles reciben cada aviso. Le llega a todos los usuarios con ese
        rol que hayan activado las notificaciones en su teléfono.
      </p>
    </div>
  );
}
