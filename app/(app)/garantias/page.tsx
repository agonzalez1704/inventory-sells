import { requirePagePermiso, getPermisos } from "@/lib/auth/profile";
import { listarGarantias, saldosGarantias } from "@/modules/garantias/actions";
import { listarProveedores } from "@/modules/proveedores/actions";
import { GarantiasView } from "@/modules/garantias/GarantiasView";
import { listarGarantiasCliente } from "@/modules/garantias/cliente-actions";


export default async function GarantiasPage({
  searchParams,
}: {
  searchParams: Promise<{ garantia?: string }>;
}) {
  const userId = await requirePagePermiso("inventario_gestionar", "/inventario");
  const perms = await getPermisos(userId);
  const puedeAprobar = perms.has("admin_total") || perms.has("garantias_aprobar");
  // The notification deep-links to the claim that needs deciding.
  const abrirGarantia = (await searchParams).garantia ?? null;
  const [garantias, saldos, proveedores, deClientes] = await Promise.all([
    listarGarantias(),
    saldosGarantias(),
    listarProveedores(),
    listarGarantiasCliente(),
  ]);
  return (
    <GarantiasView
      garantias={garantias}
      saldos={saldos}
      proveedores={proveedores}
      deClientes={deClientes}
      puedeAprobar={puedeAprobar}
      abrirGarantia={abrirGarantia}
    />
  );
}
