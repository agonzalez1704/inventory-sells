import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { getNegocioInfo, getAsesoresRaw } from "@/modules/config/lib";
import { ConfigView } from "@/modules/config/ConfigView";
import { Card } from "@/components/ui/card";
import { PushToggle } from "@/components/push-toggle";
import { NotifPrefs } from "@/modules/notifications/NotifPrefs";
import { getNotifPrefs } from "@/modules/notifications/actions";
import { Bell } from "lucide-react";

export default async function ConfiguracionPage() {
  const { userId } = await auth();
  const profile = userId ? await getProfile(userId) : null;
  const isAdmin = profile?.role === "admin";
  const [info, asesores, notifPrefs] = await Promise.all([
    getNegocioInfo(),
    getAsesoresRaw(),
    isAdmin ? getNotifPrefs() : null,
  ]);

  return (
    <div className="space-y-6">
      <ConfigView info={info} asesores={asesores} isAdmin={isAdmin} />

      {isAdmin && (
        <Card className="p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
              <Bell className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Notificaciones</h2>
              <p className="text-xs text-muted-foreground">
                Recibe un aviso en tu teléfono por cada venta y fiado. Actívalo
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
