"use server";

import { auth } from "@clerk/nextjs/server";
import { modelosCompatibles, type Compat } from "@/lib/compat";

// Staff (Inventario / Ventas): the client already holds the product list, so we
// only return the AI's model names — it matches them locally.
export async function compatiblesStaff(query: string): Promise<Compat> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  return modelosCompatibles(query);
}
