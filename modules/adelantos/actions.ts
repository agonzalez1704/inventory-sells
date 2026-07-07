"use server";

import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { toCents } from "@/lib/money";
import type { PaymentMethod } from "@/lib/types";

export type AdelantoTipo = "apartado" | "pedido";

async function client() {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  return createInsForgeServerClient();
}

// Create an adelanto (advance/layaway) with an optional first abono.
export async function crearAdelanto(input: {
  tipo: AdelantoTipo;
  productId: string | null;
  descripcion: string | null;
  qty: number;
  precio: number; // pesos
  cliente: string | null;
  abono: number; // pesos (0 = none)
  abonoMetodo: PaymentMethod;
}): Promise<{ id: string }> {
  const insforge = await client();
  const { data, error } = await insforge.database.rpc("crear_adelanto", {
    p_tipo: input.tipo,
    p_product_id: input.productId,
    p_descripcion: input.descripcion?.trim() || null,
    p_qty: Math.max(1, Math.round(input.qty || 1)),
    p_precio_cents: Math.max(0, toCents(input.precio || 0)),
    p_cliente: input.cliente?.trim() || null,
    p_abono_cents: input.abono > 0 ? Math.max(0, toCents(input.abono)) : 0,
    p_abono_metodo: input.abonoMetodo,
  });
  if (error) throw new Error(error.message ?? "Error al crear el adelanto");
  return { id: String(data) };
}

export async function abonarAdelanto(
  id: string,
  monto: number, // pesos
  metodo: PaymentMethod,
): Promise<void> {
  const insforge = await client();
  const { error } = await insforge.database.rpc("abonar_adelanto", {
    p_adelanto_id: id,
    p_monto_cents: Math.max(0, toCents(monto || 0)),
    p_metodo: metodo,
  });
  if (error) throw new Error(error.message ?? "Error al abonar");
}

export async function entregarAdelanto(id: string): Promise<void> {
  const insforge = await client();
  const { error } = await insforge.database.rpc("entregar_adelanto", {
    p_adelanto_id: id,
  });
  if (error) throw new Error(error.message ?? "Error al entregar");
}

export async function cancelarAdelanto(id: string): Promise<void> {
  const insforge = await client();
  const { error } = await insforge.database.rpc("cancelar_adelanto", {
    p_adelanto_id: id,
  });
  if (error) throw new Error(error.message ?? "Error al cancelar");
}
