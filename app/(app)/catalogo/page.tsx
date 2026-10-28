import { permisosDe, requirePagePermiso } from "@/lib/auth/profile";
import { MARCA } from "@/lib/marca";
import { opcionesCatalogo } from "@/modules/catalogo/actions";
import { CatalogoView } from "@/modules/catalogo/CatalogoView";

export default async function CatalogoPage() {
  await requirePagePermiso("inventario_ver");
  const [opciones, perms] = await Promise.all([opcionesCatalogo(), permisosDe()]);
  const admin = perms.has("admin_total");
  return (
    <CatalogoView
      opciones={opciones}
      puedeEditar={admin || perms.has("inventario_gestionar")}
      puedePrecios={admin || perms.has("precios_gestionar")}
      autopartes={MARCA.id === "ruli"}
    />
  );
}
