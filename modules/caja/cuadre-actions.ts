"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { getPermisos } from "@/lib/auth/profile";
import { mxHoy } from "@/lib/caja-range";
import { attempt, type ActionResult } from "@/lib/errors";
import { cuadreDelDia } from "./cuadre";

const DENOMINACIONES = ["1000", "500", "200", "100", "50", "20"] as const;

async function quienPuede() {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const perms = await getPermisos(userId);
  // Seeing the expected amount (and so the difference) is for the corte and
  // for whoever squares the drawer; caja_movimientos alone counts blind.
  const verCorte = perms.has("admin_total") || perms.has("corte_ver") || perms.has("caja_cuadre");
  if (!verCorte && !perms.has("caja_movimientos")) throw new Error("Sin permiso para contar la caja");
  return { userId, verCorte, admin: perms.has("admin_total") };
}

/**
 * Count the drawer ('conteo', any time) or close the day ('cierre', once).
 * The expected amount is computed here and stored with the count, so the
 * difference is fixed at the moment of counting. Whoever can't see the corte
 * counts blind: the result carries no expected amount or difference.
 */
export async function registrarConteo(input: {
  fecha: string;
  sucursalId: string | null;
  tipo: "conteo" | "cierre";
  desglose: Record<string, number>;
  monedasCents: number;
  /** When the user typed the total instead of counting bills. */
  totalCents: number | null;
  nota: string | null;
  fondoSiguienteCents: number | null;
}): Promise<ActionResult<{ diferenciaCents: number | null }>> {
  return attempt("registrarConteo", async () => {
    const { userId, verCorte } = await quienPuede();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fecha)) throw new Error("Fecha inválida");
    if (input.fecha !== mxHoy() && !verCorte) throw new Error("Solo se puede contar la caja de hoy");

    const desglose: Record<string, number> = {};
    let contado = 0;
    for (const d of DENOMINACIONES) {
      const n = Math.max(0, Math.floor(Number(input.desglose[d] ?? 0)));
      if (n) desglose[d] = n;
      contado += n * Number(d) * 100;
    }
    const monedas = Math.max(0, Math.round(Number(input.monedasCents) || 0));
    if (monedas) desglose.monedas_cents = monedas;
    contado += monedas;
    if (input.totalCents != null) {
      if (!Number.isFinite(input.totalCents) || input.totalCents < 0) throw new Error("Total inválido");
      contado = Math.round(input.totalCents);
    }

    const cuadre = await cuadreDelDia(input.fecha, input.sucursalId);
    const { error } = await insforgeAdmin.database.from("caja_conteos").insert([
      {
        fecha: input.fecha,
        sucursal_id: cuadre.sucursalId,
        tipo: input.tipo,
        contado_cents: contado,
        esperado_cents: cuadre.esperadoCents,
        desglose: input.totalCents != null ? null : desglose,
        fondo_siguiente_cents:
          input.tipo === "cierre" && input.fondoSiguienteCents != null
            ? Math.max(0, Math.round(input.fondoSiguienteCents))
            : null,
        nota: input.nota?.trim().slice(0, 500) || null,
        created_by: userId,
      },
    ]);
    if (error) {
      if (/unique|duplicate/i.test(error.message ?? "")) throw new Error("Ese día ya está cerrado");
      throw new Error(error.message ?? "No se pudo guardar el conteo");
    }
    revalidatePath("/caja/cuadre");
    return { diferenciaCents: verCorte ? contado - cuadre.esperadoCents : null };
  });
}

/** Undo a close (admin): the day can be counted and closed again. */
export async function reabrirDia(conteoId: string): Promise<ActionResult<null>> {
  return attempt("reabrirDia", async () => {
    const { admin } = await quienPuede();
    if (!admin) throw new Error("Solo un administrador puede reabrir el día");
    const { error } = await insforgeAdmin.database.from("caja_conteos").delete().eq("id", conteoId).eq("tipo", "cierre");
    if (error) throw new Error(error.message ?? "No se pudo reabrir");
    revalidatePath("/caja/cuadre");
    return null;
  });
}
