import { requirePagePermiso } from "@/lib/auth/profile";
import { listarGarantias, saldosGarantias } from "@/modules/garantias/actions";
import { listarProveedores } from "@/modules/proveedores/actions";
import { GarantiasView } from "@/modules/garantias/GarantiasView";
import { listarGarantiasCliente } from "@/modules/garantias/cliente-actions";

export const dynamic = "force-dynamic";

export default async function GarantiasPage() {
  await requirePagePermiso("inventario_gestionar", "/inventario");
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
    />
  );
}
