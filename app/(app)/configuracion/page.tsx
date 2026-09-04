import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { getNegocioInfo, getAsesoresRaw, getValorBase, getTiendaInfo } from "@/modules/config/lib";
import { fiadoExigeCliente, posClickAbreDetalle, comprobanteObligatorio } from "@/modules/config/negocio";
import { ConfigView } from "@/modules/config/ConfigView";
import { Card } from "@/components/ui/card";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { listarSucursales } from "@/modules/sucursales/actions";
import { SucursalesConfig } from "@/modules/sucursales/SucursalesConfig";
import { listarCuentasAdmin } from "@/modules/config/cuentas";
import { CuentasNegocio } from "@/modules/config/CuentasNegocio";
import { Plane } from "lucide-react";
import { PushToggle } from "@/components/push-toggle";
import { NotifRoles } from "@/modules/notifications/NotifRoles";
import { notificacionesPorRol } from "@/modules/notifications/rol-actions";

import { Bell, ScanBarcode } from "lucide-react";
import { getPermisos } from "@/lib/auth/profile";
import { getPrecioBasePos } from "@/modules/sales/pos-prefs";
import { PosPrefs } from "@/modules/sales/PosPrefs";
import { PosModoClick } from "@/modules/config/PosModoClick";
import { ComprobanteToggle } from "@/modules/config/ComprobanteToggle";

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
  const [info, asesores, valorBase, tienda, fiadoExige, posDetalle, comprobanteOblig, notifRoles, precioBasePos] = await Promise.all([
    getNegocioInfo(),
    getAsesoresRaw(),
    getValorBase(),
    getTiendaInfo(),
    fiadoExigeCliente(),
    posClickAbreDetalle(),
    comprobanteObligatorio(),
    puedeGestionarUsuarios ? notificacionesPorRol() : null,
    getPrecioBasePos(),
  ]);

  // AliExpress connection status + authorize link. Only offered when the app
  // credentials exist in env (Fiable) and the viewer is an admin.
  const aliKey = process.env.ALIEXPRESS_APP_KEY;
  let aliConectado = false;
  if (isAdmin && aliKey) {
    const { data } = await insforgeAdmin.database
      .from("config_negocio")
      .select("aliexpress_token, aliexpress_expira")
      .eq("id", 1)
      .maybeSingle();
    const c = data as { aliexpress_token: string | null; aliexpress_expira: string | null } | null;
    aliConectado = Boolean(
      c?.aliexpress_token && c.aliexpress_expira && new Date(c.aliexpress_expira) > new Date(),
    );
  }
  const sucursales = isAdmin ? await listarSucursales() : [];
  const cuentas = isAdmin ? await listarCuentasAdmin() : [];
  const aliAuthUrl = aliKey
    ? `https://api-sg.aliexpress.com/oauth/authorize?response_type=code&client_id=${aliKey}&redirect_uri=${encodeURIComponent("https://fiable.vercel.app/api/aliexpress/callback")}&force_auth=true`
    : null;

  return (
    <div className="space-y-6">
      <ConfigView
        info={info}
        asesores={asesores}
        valorBase={valorBase}
        tienda={tienda}
        fiadoExige={fiadoExige}
        isAdmin={isAdmin}
      />

      {isAdmin && <SucursalesConfig sucursales={sucursales} />}

      {isAdmin && <CuentasNegocio cuentas={cuentas} isAdmin={isAdmin} />}

      {isAdmin && aliAuthUrl && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
                <Plane className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">AliExpress (dropshipping)</h2>
                <p className="text-xs text-muted-foreground">
                  {aliConectado
                    ? "Cuenta conectada — lista para la compra automática cuando AliExpress autorice el API."
                    : "Autoriza la app para que el sistema pueda comprar por ti cuando el API esté aprobado."}
                </p>
              </div>
            </div>
            <a
              href={aliAuthUrl}
              className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:border-ring/40"
            >
              {aliConectado ? "Reconectar" : "Conectar AliExpress"}
            </a>
          </div>
        </Card>
      )}

      {/* One POS card, two scopes, each labeled: the shop-wide behavior an
          admin sets for everyone, and the personal display preference. Two
          cards both named "Punto de venta" was the confusion reported. */}
      {(verCostos || isAdmin) && (
        <Card className="p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
              <ScanBarcode className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Punto de venta</h2>
            </div>
          </div>
          {isAdmin && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Del negocio · afecta a todos
              </p>
              <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
                Qué hace un clic sobre un producto. Se guarda al elegir.
              </p>
              <PosModoClick inicial={posDetalle} />
              <p className="mb-2 mt-4 text-xs text-muted-foreground">
                Comprobante en pagos por transferencia (referencia o captura).
              </p>
              <ComprobanteToggle inicial={comprobanteOblig} />
            </div>
          )}
          {verCostos && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tuyo · no cambia lo que ven los demás
              </p>
              <div className="mt-2">
                <PosPrefs inicial={precioBasePos} />
              </div>
            </div>
          )}
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
