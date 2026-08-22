import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { getNegocioInfo, getAsesoresRaw, getValorBase, getTiendaInfo } from "@/modules/config/lib";
import { fiadoExigeCliente, posClickAbreDetalle } from "@/modules/config/negocio";
import { ConfigView } from "@/modules/config/ConfigView";
import { Card } from "@/components/ui/card";
import { PushToggle } from "@/components/push-toggle";
import { NotifRoles } from "@/modules/notifications/NotifRoles";
import { notificacionesPorRol } from "@/modules/notifications/rol-actions";

import { Bell, ScanBarcode } from "lucide-react";
import { getPermisos } from "@/lib/auth/profile";
import { getPrecioBasePos } from "@/modules/sales/pos-prefs";
import { PosPrefs } from "@/modules/sales/PosPrefs";

export default async function ConfiguracionPage() {
  const { userId } = await auth();
  const profile = userId ? await getProfile(userId) : null;
  const isAdmin = profile?.role === "admin";
  // The register's cost view answers to costos_ver, like the cost column and
  // the inventory valuation. Whoever cannot see costs is not offered a switch
  // that only has one legal position.
  const perms = userId ? await getPermisos(userId) : null;
  const puedeGestionarUsuarios = Boolean(
    perms && (perms.has("admin_total") || perms.has("usuarios_gestionar")),
  );
  const verCostos = Boolean(
    perms && (perms.has("admin_total") || perms.has("costos_ver")),
  );
  const [info, asesores, valorBase, tienda, fiadoExige, posDetalle, notifRoles, precioBasePos] = await Promise.all([
    getNegocioInfo(),
    getAsesoresRaw(),
    getValorBase(),
    getTiendaInfo(),
    fiadoExigeCliente(),
    posClickAbreDetalle(),
    puedeGestionarUsuarios ? notificacionesPorRol() : null,
    getPrecioBasePos(),
  ]);

  return (
    <div className="space-y-6">
      <ConfigView
        info={info}
        asesores={asesores}
        valorBase={valorBase}
        tienda={tienda}
        fiadoExige={fiadoExige}
        posDetalle={posDetalle}
        isAdmin={isAdmin}
      />

      {verCostos && (
        <Card className="p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
              <ScanBarcode className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Punto de venta</h2>
              <p className="text-xs text-muted-foreground">
                Preferencias tuyas, no del negocio.
              </p>
            </div>
          </div>
          <div className="mt-3">
            <PosPrefs inicial={precioBasePos} />
          </div>
        </Card>
      )}

      {/* Everyone, not just admins. Which events reach you is decided by your
          role now, so a seller whose role gets warranty alerts still has to be
          able to turn push on for their own phone. */}
      <Card className="p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
            <Bell className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Notificaciones en este teléfono</h2>
            <p className="text-xs text-muted-foreground">
              Actívalas en cada dispositivo donde quieras recibirlas. Qué avisos
              te llegan depende de tu rol.
            </p>
          </div>
        </div>
        <div className="mt-3">
          <PushToggle />
        </div>
      </Card>

      {/* Deciding who hears what is managing staff, so it rides the permission
          that already means exactly that. */}
      {puedeGestionarUsuarios && notifRoles && (
        <Card className="p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
              <Bell className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Avisos por rol</h2>
              <p className="text-xs text-muted-foreground">
                Qué eventos recibe cada rol. Cambia con el puesto, no con la
                persona.
              </p>
            </div>
          </div>
          <div className="mt-3">
            <NotifRoles inicial={notifRoles} />
          </div>
        </Card>
      )}
    </div>
  );
}
