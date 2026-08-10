import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { getNegocioInfo, getAsesoresRaw, getValorBase, getTiendaInfo } from "@/modules/config/lib";
import { ConfigView } from "@/modules/config/ConfigView";
import { Card } from "@/components/ui/card";
import { PushToggle } from "@/components/push-toggle";
import { NotifPrefs } from "@/modules/notifications/NotifPrefs";
import { getNotifPrefs } from "@/modules/notifications/actions";
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
  const verCostos = Boolean(
    perms && (perms.has("admin_total") || perms.has("costos_ver")),
  );
  const [info, asesores, valorBase, tienda, notifPrefs, precioBasePos] = await Promise.all([
    getNegocioInfo(),
    getAsesoresRaw(),
    getValorBase(),
    getTiendaInfo(),
    isAdmin ? getNotifPrefs() : null,
    getPrecioBasePos(),
  ]);

  return (
    <div className="space-y-6">
      <ConfigView
        info={info}
        asesores={asesores}
        valorBase={valorBase}
        tienda={tienda}
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

      {isAdmin && (
        <Card className="p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
              <Bell className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Notificaciones</h2>
              <p className="text-xs text-muted-foreground">
                Recibe un aviso en tu teléfono por cada venta y nota de crédito. Actívalo
                en cada dispositivo donde quieras recibirlas.
              </p>
            </div>
          </div>
          <div className="mt-3 space-y-4">
            <PushToggle />
            {notifPrefs && <NotifPrefs initial={notifPrefs} />}
          </div>
        </Card>
      )}
    </div>
  );
}
