"use server";

import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { attempt, type ActionResult } from "@/lib/errors";
import { bancoDeClabe, validarClabe, type Cuenta } from "@/lib/bancos";

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

/** Register by CLABE: the bank comes from its first 3 digits, the alias
 *  defaults to "<Banco> ·<últimos 4>". */
export async function crearCuenta(clabe: string, alias: string): Promise<ActionResult<null>> {
  return attempt("crearCuenta", async () => {
    await requireAdmin();
    const digitos = clabe.replace(/\D/g, "");
    if (!validarClabe(digitos))
      throw new Error("CLABE inválida: revisa los 18 dígitos");
    const b = bancoDeClabe(digitos)!;
    const a = alias.trim() || `${b.nombre} ·${digitos.slice(-4)}`;
    const { error } = await insforgeAdmin.database
      .from("cuentas_negocio")
      .insert([{ banco: b.banco, alias: a, clabe: digitos }]);
    if (error) throw new Error(error.message ?? "No se pudo crear");
    return null;
  });
}

export type CuentaAdmin = Cuenta & { clabe: string | null };

/** Config list — includes the CLABE, so admin-only. */
export async function listarCuentasAdmin(): Promise<CuentaAdmin[]> {
  await requireAdmin();
  const { data } = await insforgeAdmin.database
    .from("cuentas_negocio")
    .select("id, banco, alias, clabe")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  return (data ?? []) as CuentaAdmin[];
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
