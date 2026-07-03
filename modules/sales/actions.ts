"use server";

import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
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

// Correct a completed sale's payment method / customer (admin only).
export async function editarVenta(
  saleId: string,
  paymentMethod: PaymentMethod,
  customerName: string | null,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database.rpc("editar_venta", {
    p_sale_id: saleId,
    p_payment_method: paymentMethod,
    p_customer_name: customerName?.trim() || null,
  });
  if (error) throw new Error(error.message ?? "Error al editar la venta");
}

// Partial return: refund some items of a completed sale. Restores stock and
// records the refund as a cash outflow today (the original sale is untouched).
export async function devolverItems(
  saleId: string,
  items: CartLine[],
  metodo: PaymentMethod,
  motivo: string | null,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin") throw new Error("Solo administradores");
  if (items.length === 0) throw new Error("Sin artículos a devolver");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database.rpc("devolver_items", {
    p_sale_id: saleId,
    p_items: items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
    p_metodo: metodo,
    p_motivo: motivo?.trim() || null,
  });
  if (error) throw new Error(error.message ?? "Error al registrar la devolución");
}

// Change the product(s) on a registered sale (customer swapped models). Old
// items return to stock, new ones leave it, total recomputed — all atomically.
export async function cambiarVentaItems(
  saleId: string,
  items: CartLine[],
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  if (items.length === 0) throw new Error("Sin productos");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database.rpc("editar_items", {
    p_sale_id: saleId,
    p_items: items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
  });
  if (error) throw new Error(error.message ?? "Error al cambiar la venta");
}

// Swap the product(s) on a pending loan: the old items go back to stock, the
// new ones leave it, and the loan total is recomputed — all atomically.
export async function cambiarFiado(
  saleId: string,
  items: CartLine[],
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  if (items.length === 0) throw new Error("Sin productos");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database.rpc("editar_fiado", {
    p_sale_id: saleId,
    p_items: items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
  });
  if (error) throw new Error(error.message ?? "Error al cambiar el fiado");
}

// Fix a sale registered by mistake that should have been a fiado: flip the
// completed sale back to a pending loan. Stock is untouched (it already left on
// the sale); `note` records who owes.
export async function convertirAFiado(
  saleId: string,
  note: string | null,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database.rpc("convertir_a_fiado", {
    p_sale_id: saleId,
    p_note: note?.trim() || null,
  });
  if (error) throw new Error(error.message ?? "Error al convertir a fiado");
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
