"use server";

import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import type { ValorBase } from "@/lib/marca";
import { normalizarTienda, type TiendaInfo } from "@/lib/tienda-info";

export async function updateNegocioInfo(
  info: string,
  asesores: string,
  valorBase: ValorBase,
  tienda: TiendaInfo,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin") throw new Error("Solo administradores");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database
    .from("config_negocio")
    // Normalised on the way in as well as out: the form sends strings, and a
    // half-filled origin must be stored as no origin rather than as three
    // fields a courier will quote from.
    .update({ info, asesores, valor_base: valorBase, tienda: normalizarTienda(tienda) })
    .eq("id", 1);
  if (error) throw new Error(error.message ?? "Error al guardar");
}
