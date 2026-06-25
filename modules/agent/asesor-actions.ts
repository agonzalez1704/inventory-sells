"use server";

import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";

// Hand a conversation back to the bot once a human is done with it.
export async function devolverABot(numero: string): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database
    .from("conversaciones")
    .update({ estado: "bot" })
    .eq("numero", numero);
  if (error) throw new Error(error.message ?? "Error al devolver al bot");
}
