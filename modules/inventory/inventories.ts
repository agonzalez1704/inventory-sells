"use server";

import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import type { Inventory } from "@/lib/types";

export async function createInventory(name: string): Promise<Inventory> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin") throw new Error("Solo administradores");

  const clean = name.trim();
  if (!clean) throw new Error("El nombre es obligatorio");

  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database
    .from("inventories")
    .insert([{ name: clean }])
    .select("id, name")
    .maybeSingle();

  if (error || !data) throw new Error(error?.message ?? "Error al crear el inventario");
  return data as Inventory;
}
