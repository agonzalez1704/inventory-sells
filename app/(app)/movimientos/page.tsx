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

  const [{ data: gastos }, { data: ingresos }] = await Promise.all([
    mios("gastos"),
    mios("ingresos"),
  ]);

  return (
    <MovimientosView
      gastos={(gastos ?? []) as Gasto[]}
      ingresos={(ingresos ?? []) as Gasto[]}
    />
  );
}
