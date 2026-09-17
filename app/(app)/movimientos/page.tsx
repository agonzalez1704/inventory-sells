import { requirePagePermiso } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { mxHoy, rangoUTC } from "@/lib/caja-range";
import { MovimientosView } from "@/modules/caja/MovimientosView";
import type { Gasto } from "@/modules/caja/CajaView";

// Register gastos / ingresos extra without corte access: the caja page shows
// the whole day's money and answers to corte_ver; this one shows only what
// the signed-in user captured today.
export default async function MovimientosPage() {
  const userId = await requirePagePermiso("caja_movimientos");
  const { startISO, endISO } = rangoUTC(mxHoy(), mxHoy());

  const mios = (tabla: "gastos" | "ingresos") =>
    insforgeAdmin.database
      .from(tabla)
      .select("id, concepto, monto_cents, metodo, categoria, created_at")
      .eq("created_by", userId)
      .gte("created_at", startISO)
      .lt("created_at", endISO)
      .order("created_at", { ascending: false });

  const [{ data: gastos }, { data: ingresos }, { data: sucs }, { data: chk }] = await Promise.all([
    mios("gastos"),
    mios("ingresos"),
    insforgeAdmin.database.from("sucursales").select("id, nombre").eq("is_active", true),
    insforgeAdmin.database
      .from("checkins")
      .select("sucursal_id")
      .eq("profile_id", userId)
      .gte("created_at", startISO)
      .lt("created_at", endISO)
      .limit(1),
  ]);
  // The drawer this person can count: the sucursal they checked in at today
  // (or the only drawer, when the business has no sucursales).
  const sucursales = (sucs ?? []) as { id: string; nombre: string }[];
  const chkId = ((chk ?? []) as { sucursal_id: string }[])[0]?.sucursal_id ?? null;
  const cajon =
    sucursales.length === 0
      ? { sucursalId: null, nombre: null }
      : chkId
        ? { sucursalId: chkId, nombre: sucursales.find((x) => x.id === chkId)?.nombre ?? null }
        : null;
  const { data: cierre } = await (cajon?.sucursalId
    ? insforgeAdmin.database.from("caja_conteos").select("id").eq("sucursal_id", cajon.sucursalId)
    : insforgeAdmin.database.from("caja_conteos").select("id").is("sucursal_id", null)
  )
    .eq("fecha", mxHoy())
    .eq("tipo", "cierre")
    .limit(1);

  return (
    <MovimientosView
      gastos={(gastos ?? []) as Gasto[]}
      ingresos={(ingresos ?? []) as Gasto[]}
      cajon={cajon}
      cerrado={(cierre ?? []).length > 0}
      hoy={mxHoy()}
    />
  );
}
