"use server";

import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";

export async function updateNegocioInfo(
  info: string,
  asesores: string,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin") throw new Error("Solo administradores");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database
    .from("config_negocio")
    .update({ info, asesores })
    .eq("id", 1);
  if (error) throw new Error(error.message ?? "Error al guardar");
}
