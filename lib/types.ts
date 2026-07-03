export type Role = "admin" | "seller";
export type PaymentMethod = "efectivo" | "tarjeta" | "transferencia" | "otro";

export interface Profile {
  id: string;
  full_name: string | null;
  role: Role;
}

export interface Inventory {
  id: string;
  name: string;
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
  created_at: string;
  updated_at: string;
}

export type SaleStatus = "pending" | "completed" | "void";

export interface Sale {
  id: string;
  total_cents: number;
  payment_method: PaymentMethod | null;
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
