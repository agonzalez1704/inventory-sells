import { requirePagePermiso, getPermisos } from "@/lib/auth/profile";
import { listarGarantias, saldosGarantias } from "@/modules/garantias/actions";
import { listarProveedores } from "@/modules/proveedores/actions";
import { GarantiasView } from "@/modules/garantias/GarantiasView";
import { listarGarantiasCliente } from "@/modules/garantias/cliente-actions";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import type { PickerCustomer } from "@/modules/customers/CustomerPicker";


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
  const insforge = await createInsForgeServerClient();
  const [garantias, saldos, proveedores, deClientes, { data: customerData }] = await Promise.all([
    listarGarantias(),
    saldosGarantias(),
    listarProveedores(),
    listarGarantiasCliente(),
    // For the claim on a Mostrador sale: it gets a person before it is filed.
    insforge.database
      .from("customers")
      .select("id, nombre, telefono, is_system")
      .eq("is_active", true)
      .order("nombre", { ascending: true }),
  ]);
  const customers = (customerData ?? []) as PickerCustomer[];
  return (
    <GarantiasView
      garantias={garantias}
      saldos={saldos}
      proveedores={proveedores}
      deClientes={deClientes}
      customers={customers}
      puedeAprobar={puedeAprobar}
      abrirGarantia={abrirGarantia}
    />
  );
}
