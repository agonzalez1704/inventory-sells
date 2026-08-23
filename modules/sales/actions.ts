"use server";

import { after } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getPermisos, getProfile } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { toCents } from "@/lib/money";
import { notifyNuevaVenta, notifyAbono, notifyCancelacion } from "@/lib/push";
import type { CartLine, PaymentMethod, PaymentMethodVenta } from "@/lib/types";
import type { SaleWithItems } from "./RecentSales";

// Search completed sales by creator (seller), customer, sold products, or total.
// Token-AND across all those fields; a numeric token also matches the total.
export async function buscarVentas(q: string): Promise<SaleWithItems[]> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const query = q.trim().toLowerCase();
  if (!query) return [];

  // The search honors the same scope as the list. Without this it was the
  // leak that undid the list's filter: type anything and read every seller's
  // last 500 tickets.
  const perms = await getPermisos(userId);
  const veTodas = perms.has("admin_total") || perms.has("ventas_ver");

  const insforge = await createInsForgeServerClient();
  let ventasQ = insforge.database
    .from("sales")
    .select(
      "id, total_cents, payment_method, customer_name, created_at, settled_at, sold_by, sale_items(product_id, qty, unit_price_cents, products(name, sku))",
    )
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(500);
  if (!veTodas) ventasQ = ventasQ.eq("sold_by", userId);
  const [{ data: salesData }, { data: profileData }] = await Promise.all([
    ventasQ,
    insforge.database.from("profiles").select("id, full_name"),
  ]);

  const sellerName = new Map(
    ((profileData ?? []) as { id: string; full_name: string | null }[]).map(
      (p) => [p.id, p.full_name],
    ),
  );
  const tokens = query.split(/\s+/).filter(Boolean);
  const sales = (salesData ?? []) as unknown as SaleWithItems[];

  return sales
    .filter((s) => {
      const vendedor = s.sold_by ? sellerName.get(s.sold_by) : null;
      const pesos = s.total_cents / 100;
      const hay = [
        s.customer_name ?? "",
        vendedor ?? "",
        String(pesos),
        pesos.toFixed(2),
        ...(s.sale_items ?? []).flatMap((it) => [
          it.products?.name ?? "",
          it.products?.sku ?? "",
        ]),
      ]
        .join(" ")
        .toLowerCase();
      return tokens.every((t) => hay.includes(t));
    })
    .slice(0, 50)
    .map((s) => ({
      ...s,
      vendedor: (s.sold_by ? sellerName.get(s.sold_by) : null) ?? null,
    }));
}

// Register a sale atomically via the register_sale() RPC: it locks each product
// row, rejects oversell, and writes sale + items + stock movements in one tx.
// A sale is the one thing store credit can pay for.
export type PagoSplit = { metodo: PaymentMethodVenta; monto_cents: number };

export async function registerSale(
  items: CartLine[],
  paymentMethod: PaymentMethodVenta,
  customerId: string | null,
  // Split payment (part transfer, part cash…). The RPC requires these to add
  // up to the sale total and marks the sale 'mixto'; one entry is treated as a
  // plain single-method sale.
  pagos?: PagoSplit[],
): Promise<{ saleId: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  if (items.length === 0) throw new Error("Carrito vacío");

  const insforge = await createInsForgeServerClient();
  // register_sale copies the customer's name into customer_name from the id,
  // so the ticket/history keep one source of truth.
  const { data, error } = await insforge.database.rpc("register_sale", {
    p_items: items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
    p_payment_method: paymentMethod,
    p_customer_id: customerId ?? null,
    // A split, OR anything paid with store credit: a credit-only sale is one
    // payment, and dropping it here would leave register_sale with no way to
    // know the ledger has to move.
    p_pagos:
      pagos && (pagos.length > 1 || pagos.some((p) => p.metodo === "saldo"))
        ? pagos
        : null,
  });

  if (error) throw new Error(error.message ?? "Error al registrar la venta");
  const saleId = String(data);
  // Notify admins after the response is sent (non-blocking, never breaks the sale).
  after(() => notifyNuevaVenta(saleId, "venta"));
  return { saleId };
}

// Lend items on credit (fiado): stock leaves now, payment pending. With a
// customer the note is an optional reminder; on a walk-in debt it IS the
// debtor, and the RPC requires it.
export async function registerLoan(
  items: CartLine[],
  /** Null means the walk-in placeholder — only some shops allow that. */
  customerId: string | null,
  note: string | null,
): Promise<{ saleId: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  if (items.length === 0) throw new Error("Carrito vacío");
  // Whether a debt can be anonymous is the shop's rule, so the check is not
  // repeated here — the RPC reads the shop's config and its message is the one
  // worth showing. A copy here could only drift out of step with it.

  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database.rpc("register_loan", {
    p_items: items.map((i) => ({ product_id: i.product_id, qty: i.qty })),
    p_customer_id: customerId ?? null,
    p_note: note?.trim() || null,
  });

  if (error) throw new Error(error.message ?? "Error al registrar la nota de crédito");
  const saleId = String(data);
  after(() => notifyNuevaVenta(saleId, "fiado"));
  return { saleId };
}

// Attach (or change) the customer on a fiado/sale — used from Fiados when
// closing or registering a payment.
export async function asignarClienteFiado(
  saleId: string,
  customerId: string,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database.rpc("asignar_cliente_venta", {
    p_sale_id: saleId,
    p_customer_id: customerId ?? null,
  });
  if (error) throw new Error(error.message ?? "Error al asignar el cliente");
}

// Partial payment (abono) toward a fiado. When it reaches the total, the fiado
// completes.
export async function abonarFiado(
  saleId: string,
  monto: number, // pesos
  metodo: PaymentMethod,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database.rpc("abonar_fiado", {
    p_sale_id: saleId,
    p_monto_cents: Math.max(0, toCents(monto || 0)),
    p_metodo: metodo,
  });
  if (error) throw new Error(error.message ?? "Error al abonar");
  after(() => notifyAbono(saleId));
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
  after(() => notifyAbono(saleId));
}

// Correct a completed sale's payment method / customer (admin only).
export async function editarVenta(
  saleId: string,
  paymentMethod: PaymentMethod,
  customerName: string | null,
  /**
   * The registered customer, by id. Omit to leave the assignment untouched;
   * null detaches it. Writing only the name looks like an assignment and is
   * not — a warranty hangs off the id, so a sale "assigned" by name keeps
   * being refused.
   */
  customerId?: string | null,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database.rpc("editar_venta", {
    p_sale_id: saleId,
    p_payment_method: paymentMethod,
    p_customer_name: customerName?.trim() || null,
    // The RPC's sentinel for "leave it alone" — NULL is a real value here, it
    // is how a sale is detached from its customer.
    ...(customerId === undefined
      ? {}
      : { p_customer_id: customerId }),
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
  if (error) throw new Error(error.message ?? "Error al cambiar la nota de crédito");
}

// Void a completed sale (e.g. a duplicate). Admin only: restores stock, removes
// its abonos and marks it void so it drops out of income.
export async function anularVenta(saleId: string): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin") throw new Error("Solo administradores");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database.rpc("anular_venta", {
    p_sale_id: saleId,
  });
  if (error) throw new Error(error.message ?? "Error al anular la venta");
  after(() => notifyCancelacion(saleId, "venta"));
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
  if (error) throw new Error(error.message ?? "Error al convertir a nota de crédito");
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
  after(() => notifyCancelacion(saleId, "fiado"));
}
