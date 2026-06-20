"use server";

import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import type { CartLine, PaymentMethod } from "@/lib/types";

// Register a sale atomically via the register_sale() RPC: it locks each product
// row, rejects oversell, and writes sale + items + stock movements in one tx.
export async function registerSale(
  items: CartLine[],
  paymentMethod: PaymentMethod,
  customerName: string | null,
): Promise<{ saleId: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  if (items.length === 0) throw new Error("Carrito vacío");

  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database.rpc("register_sale", {
    p_items: items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
    p_payment_method: paymentMethod,
    p_customer_name: customerName?.trim() || null,
  });

  if (error) throw new Error(error.message ?? "Error al registrar la venta");
  return { saleId: String(data) };
}

// Lend items on credit (fiado): stock leaves now, payment pending. `note` is a
// free-text reminder (person/place) — no client record is created.
export async function registerLoan(
  items: CartLine[],
  note: string | null,
): Promise<{ saleId: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  if (items.length === 0) throw new Error("Carrito vacío");

  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database.rpc("register_loan", {
    p_items: items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
    p_note: note?.trim() || null,
  });

  if (error) throw new Error(error.message ?? "Error al registrar el fiado");
  return { saleId: String(data) };
}

// Collect a pending loan → becomes a completed sale (revenue counts now).
export async function settleLoan(
  saleId: string,
  paymentMethod: PaymentMethod,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database.rpc("settle_loan", {
    p_sale_id: saleId,
    p_payment_method: paymentMethod,
  });
  if (error) throw new Error(error.message ?? "Error al cobrar");
}

// Cancel a pending loan: item returned without payment → stock restored.
export async function cancelLoan(saleId: string): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database.rpc("cancel_loan", {
    p_sale_id: saleId,
  });
  if (error) throw new Error(error.message ?? "Error al cancelar");
}
