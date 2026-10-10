"use server";

import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { attempt, type ActionResult } from "@/lib/errors";
import { comisionEfectiva, type Terminal } from "@/lib/terminales";

// Card terminals. Admins manage them in Configuración; the register reads them
// to ask which one took the card; the corte reads them back per sale.

type Fila = Omit<Terminal, "cuenta" | "comision_pct"> & {
  comision_pct: number | string;
  cuentas_negocio: Terminal["cuenta"] | Terminal["cuenta"][] | null;
};

const aTerminal = (f: Fila): Terminal => ({
  id: f.id,
  nombre: f.nombre,
  procesador: f.procesador,
  comision_pct: Number(f.comision_pct),
  iva_comision: f.iva_comision,
  cuenta: Array.isArray(f.cuentas_negocio) ? (f.cuentas_negocio[0] ?? null) : f.cuentas_negocio,
});

export async function listarTerminales(): Promise<Terminal[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const { data } = await insforgeAdmin.database
    .from("terminales_pago")
    .select("id, nombre, procesador, comision_pct, iva_comision, cuentas_negocio(id, banco, alias)")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  return ((data ?? []) as unknown as Fila[]).map(aTerminal);
}

async function requireAdmin(): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin") throw new Error("Solo administradores");
}

export async function guardarTerminal(input: {
  id?: string | null;
  nombre: string;
  procesador: string;
  comisionPct: number;
  ivaComision: boolean;
  cuentaId: string | null;
}): Promise<ActionResult<null>> {
  return attempt("guardarTerminal", async () => {
    await requireAdmin();
    const nombre = input.nombre.trim().replace(/\s+/g, " ");
    if (nombre.length < 2) throw new Error("Ponle nombre a la terminal");
    if (!Number.isFinite(input.comisionPct) || input.comisionPct < 0 || input.comisionPct >= 100)
      throw new Error("La comisión debe ser un porcentaje entre 0 y 100");
    const fila = {
      nombre,
      procesador: input.procesador || "otro",
      comision_pct: Math.round(input.comisionPct * 1000) / 1000,
      iva_comision: input.ivaComision,
      cuenta_id: input.cuentaId,
    };
    const { error } = input.id
      ? await insforgeAdmin.database.from("terminales_pago").update(fila).eq("id", input.id)
      : await insforgeAdmin.database.from("terminales_pago").insert([fila]);
    if (error) throw new Error(error.message ?? "No se pudo guardar la terminal");
    return null;
  });
}

export async function archivarTerminal(id: string): Promise<ActionResult<null>> {
  return attempt("archivarTerminal", async () => {
    await requireAdmin();
    const { error } = await insforgeAdmin.database.from("terminales_pago").update({ is_active: false }).eq("id", id);
    if (error) throw new Error(error.message ?? "No se pudo archivar");
    return null;
  });
}

/**
 * Record which terminal took a sale's card payment, right after the charge.
 * The commission is frozen onto the sale: a later rate change must not
 * rewrite past cortes.
 */
export async function asignarTerminalVenta(saleId: string, terminalId: string): Promise<ActionResult<null>> {
  return attempt("asignarTerminalVenta", async () => {
    const { userId } = await auth();
    if (!userId) throw new Error("No autenticado");
    const { data } = await insforgeAdmin.database
      .from("terminales_pago")
      .select("comision_pct, iva_comision")
      .eq("id", terminalId)
      .maybeSingle();
    const t = data as { comision_pct: number | string; iva_comision: boolean } | null;
    if (!t) throw new Error("Esa terminal ya no existe");
    const { error } = await insforgeAdmin.database
      .from("sales")
      .update({
        terminal_id: terminalId,
        terminal_comision_pct: comisionEfectiva({ comision_pct: Number(t.comision_pct), iva_comision: t.iva_comision }),
      })
      .eq("id", saleId);
    if (error) throw new Error(error.message ?? "No se pudo registrar la terminal");
    return null;
  });
}
