"use server";

import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { attempt, type ActionResult } from "@/lib/errors";

async function requireAdmin(): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin") throw new Error("Solo administradores");
}

// Confirm a direct bank transfer landed: commits the sale (same RPC the Conekta
// webhook uses). Admin-only, and guarded so it can only ever fire on a pending
// direct-transfer order — never on a Conekta order that self-confirms.
export async function confirmarTransferencia(
  ordenId: string,
): Promise<ActionResult<{ saleId: string }>> {
  return attempt("confirmarTransferencia", async () => {
    await requireAdmin();

    const { data: orden } = await insforgeAdmin.database
      .from("ordenes_web")
      .select("status, metodo")
      .eq("id", ordenId)
      .maybeSingle();
    const o = orden as { status: string; metodo: string | null } | null;
    if (!o) throw new Error("Pedido no encontrado");
    if (o.status !== "pendiente") throw new Error("El pedido ya no está pendiente");
    if (o.metodo !== "transferencia")
      throw new Error("Este pedido no es de transferencia directa");

    const { data, error } = await insforgeAdmin.database.rpc("pagar_orden_web", {
      p_orden_id: ordenId,
      p_conekta_id: null,
      p_metodo: "transferencia",
    });
    if (error) throw new Error(error.message ?? "No se pudo confirmar el pago");
    return { saleId: String(data) };
  });
}

// Cancel a pending web order: releases the reserved stock. Admin-only.
export async function cancelarPedido(ordenId: string): Promise<ActionResult<null>> {
  return attempt("cancelarPedido", async () => {
    await requireAdmin();
    const { error } = await insforgeAdmin.database.rpc("cancelar_orden_web", {
      p_orden_id: ordenId,
    });
    if (error) throw new Error(error.message ?? "No se pudo cancelar el pedido");
    return null;
  });
}
