import { requirePagePermiso } from "@/lib/auth/profile";
import { listarGarantias, saldosGarantias } from "@/modules/garantias/actions";
import { listarProveedores } from "@/modules/proveedores/actions";
import { GarantiasView } from "@/modules/garantias/GarantiasView";

export const dynamic = "force-dynamic";

export default async function GarantiasPage() {
  await requirePagePermiso("inventario_gestionar", "/inventario");
  const [garantias, saldos, proveedores] = await Promise.all([
    listarGarantias(),
    saldosGarantias(),
    listarProveedores(),
  ]);
  return <GarantiasView garantias={garantias} saldos={saldos} proveedores={proveedores} />;
}
