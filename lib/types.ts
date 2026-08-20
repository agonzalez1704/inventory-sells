export type Role = "admin" | "seller";
// What a payment can be made with. "mixto" is not a method you pick — it marks
// a sale settled with several methods, whose amounts live in sale_pagos.
export type PaymentMethod = "efectivo" | "tarjeta" | "transferencia" | "otro";
export type PaymentMethodStored = PaymentMethod | "mixto" | "saldo";
/**
 * What a SALE can be paid with. Store credit is not a payment method anywhere
 * else — an expense or a supplier advance cannot be paid with it — so it stays
 * out of PaymentMethod, which those screens share.
 */
export type PaymentMethodVenta = PaymentMethod | "saldo";

export interface Profile {
  id: string;
  full_name: string | null;
  role: Role;
}

export interface Inventory {
  id: string;
  name: string;
  /** Where the stock physically sits, when not at the shop. */
  ciudad?: string | null;
  /** Extra business days for delivery from this warehouse. Null = local. */
  entrega_dias_habiles?: number | null;
}

export interface Product {
  id: string;
  inventory_id: string;
  sku: string;
  name: string;
  brand: string | null;
  size: string | null;
  color: string | null;
  category: string | null;
  attributes: Record<string, unknown>;
  cost_cents: number;
  price_cents: number;
  quantity: number;
  is_active: boolean;
  etiqueta: string | null;
  image_url: string | null; // public storefront photo
  image_key: string | null; // Storage object key (for replace/delete)
  created_at: string;
  updated_at: string;
}

export type SaleStatus = "pending" | "completed" | "void";

export interface Sale {
  id: string;
  total_cents: number;
  payment_method: PaymentMethodStored | null;
  status: SaleStatus;
  customer_name: string | null;
  note: string | null;
  sold_by: string | null;
  settled_at: string | null;
  created_at: string;
}

// A line in a sale being composed in the UI before commit.
export interface CartLine {
  product_id: string;
  qty: number;
}

// One inventory row parsed from an import (Excel/CSV/PDF), pre-commit.
export interface ImportRow {
  sku: string;
  name?: string;
  brand?: string;
  size?: string;
  color?: string;
  cost_cents?: number;
  price_cents?: number;
  quantity?: number;
}
