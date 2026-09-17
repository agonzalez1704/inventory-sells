import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { getPermisos } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { mxHoy, rangoUTC } from "@/lib/caja-range";
import { cuadreDelDia } from "@/modules/caja/cuadre";
import { CuadreView } from "@/modules/caja/CuadreView";

// The drawer of one sucursal on one day: counts, the cash timeline and what to
// check first when it doesn't match.
export default async function CuadrePage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; sucursal?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const perms = await getPermisos(userId);
  const admin = perms.has("admin_total");
  // Whoever sees the corte, or only squares the drawer (caja_cuadre).
  if (!admin && !perms.has("corte_ver") && !perms.has("caja_cuadre")) redirect("/");
  const sp = await searchParams;
  const hoy = mxHoy();
  const dia = sp.dia && /^\d{4}-\d{2}-\d{2}$/.test(sp.dia) && sp.dia <= hoy ? sp.dia : hoy;

  // Default drawer: where the viewer checked in today.
  let sucursal = sp.sucursal ?? null;
  if (!sucursal) {
    const { startISO, endISO } = rangoUTC(hoy, hoy);
    const { data } = await insforgeAdmin.database
      .from("checkins")
      .select("sucursal_id")
      .eq("profile_id", userId)
      .gte("created_at", startISO)
      .lt("created_at", endISO)
      .limit(1);
    sucursal = ((data ?? []) as { sucursal_id: string }[])[0]?.sucursal_id ?? null;
  }

  const cuadre = await cuadreDelDia(dia, sucursal);
  return <CuadreView cuadre={cuadre} hoy={hoy} admin={admin} verCorte={admin || perms.has("corte_ver")} />;
}
