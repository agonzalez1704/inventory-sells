"use server";

import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { attempt, type ActionResult } from "@/lib/errors";

/** How a warranty was settled. NULL means it was taken in and left pending. */
export type ResolucionGarantia = "saldo" | "cambio" | "efectivo";

/**
 * Register a warranty claim against a sale.
 *
 * Everything that matters is enforced in the RPC — the part was on that sale,
 * the units don't exceed what was sold, the sale has a real customer — so this
 * is a thin pass-through. Repeating those checks here would be a second copy
 * to drift.
 */
export async function registrarGarantia(
  saleId: string,
  productId: string,
  qty: number,
  motivo: string | null,
  /** Whether the part goes back on the shelf. The counter's call, no default. */
  reingresa: boolean,
  resolucion: ResolucionGarantia | null,
): Promise<ActionResult<string>> {
  return attempt("registrarGarantia", async () => {
    const { userId } = await auth();
    if (!userId) throw new Error("No autenticado");

    const insforge = await createInsForgeServerClient();
    const { data, error } = await insforge.database.rpc("registrar_garantia_cliente", {
      p_sale_id: saleId,
      p_product_id: productId,
      p_qty: qty,
      p_motivo: motivo,
      p_reingresa: reingresa,
      p_resolucion: resolucion,
    });
    if (error) throw new Error(error.message ?? "No se pudo registrar la garantía");
    return String(data);
  });
}

/**
 * A customer's store credit, in cents.
 *
 * Admin client on purpose: the register reads this for whoever is standing at
 * the counter, and it is the shop's own liability — not something a seller
 * should need a permission for to be told the customer has money with them.
 */
export async function saldoDeCliente(customerId: string): Promise<number> {
  const { userId } = await auth();
  if (!userId) return 0;
  const { data } = await insforgeAdmin.database.rpc("saldo_de_cliente", {
    p_customer_id: customerId,
  });
  return Number(data ?? 0);
}
