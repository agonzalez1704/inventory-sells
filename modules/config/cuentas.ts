"use server";

import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { attempt, type ActionResult } from "@/lib/errors";
import type { Cuenta } from "@/components/ui/cuenta";

// The shop's bank accounts, so a transfer can be tagged with WHERE it landed.
// Managed by admins in Configuración; read by every transfer-proof picker —
// including the public order page, which is fine: the customer already saw the
// bank data to make the transfer at all.

export async function listarCuentas(): Promise<Cuenta[]> {
  const { data } = await insforgeAdmin.database
    .from("cuentas_negocio")
    .select("id, banco, alias")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  return (data ?? []) as Cuenta[];
}

async function requireAdmin(): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin") throw new Error("Solo administradores");
}

export async function crearCuenta(banco: string, alias: string): Promise<ActionResult<null>> {
  return attempt("crearCuenta", async () => {
    await requireAdmin();
    const a = alias.trim();
    if (!banco) throw new Error("Elige el banco");
    if (!a) throw new Error("Ponle un alias (ej. BBVA Antonio)");
    const { error } = await insforgeAdmin.database
      .from("cuentas_negocio")
      .insert([{ banco, alias: a }]);
    if (error) throw new Error(error.message ?? "No se pudo crear");
    return null;
  });
}

export async function archivarCuenta(id: string): Promise<ActionResult<null>> {
  return attempt("archivarCuenta", async () => {
    await requireAdmin();
    const { error } = await insforgeAdmin.database
      .from("cuentas_negocio")
      .update({ is_active: false })
      .eq("id", id);
    if (error) throw new Error(error.message ?? "No se pudo archivar");
    return null;
  });
}
