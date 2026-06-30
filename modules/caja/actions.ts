"use server";

import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import type { PaymentMethod } from "@/lib/types";

export async function registrarGasto(input: {
  concepto: string;
  monto_cents: number;
  metodo: PaymentMethod;
  categoria: string | null;
}): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  if (!input.concepto.trim()) throw new Error("Falta el concepto");
  if (!Number.isFinite(input.monto_cents) || input.monto_cents <= 0) {
    throw new Error("Monto inválido");
  }

  const insforge = await createInsForgeServerClient();
  // created_by is filled by its column DEFAULT (requesting_user_id()).
  const { error } = await insforge.database.from("gastos").insert([
    {
      concepto: input.concepto.trim(),
      monto_cents: Math.round(input.monto_cents),
      metodo: input.metodo,
      categoria: input.categoria?.trim() || null,
    },
  ]);
  if (error) throw new Error(error.message ?? "Error al registrar el gasto");
}

export async function eliminarGasto(id: string): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin") throw new Error("Solo administradores");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database.from("gastos").delete().eq("id", id);
  if (error) throw new Error(error.message ?? "Error al eliminar el gasto");
}
