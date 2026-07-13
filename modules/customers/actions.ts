"use server";

import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";

export type CustomerTipo = "publico" | "mayoreo" | "tecnico";

export type Customer = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  descuento_pct: number;
  tipo: CustomerTipo;
  notas: string | null;
  is_active: boolean;
  created_at: string;
};

export type CustomerInput = {
  nombre: string;
  telefono: string | null;
  email: string | null;
  descuento_pct: number;
  tipo: CustomerTipo;
  notas: string | null;
};

// Normalize + validate the shared shape used by create/edit.
function clean(input: CustomerInput) {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("Falta el nombre");
  const pct = Number(input.descuento_pct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100)
    throw new Error("Descuento inválido (0–100)");
  return {
    nombre,
    telefono: input.telefono?.trim() || null,
    email: input.email?.trim() || null,
    descuento_pct: Math.round(pct * 100) / 100,
    tipo: input.tipo,
    notas: input.notas?.trim() || null,
  };
}

export async function crearCliente(input: CustomerInput): Promise<{ id: string }> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");

  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database
    .from("customers")
    .insert([clean(input)])
    .select("id")
    .single();

  if (error) {
    if (/duplicate|unique/i.test(error.message ?? ""))
      throw new Error("Ya existe un cliente con ese teléfono");
    throw new Error(error.message ?? "Error al crear el cliente");
  }
  return { id: (data as { id: string }).id };
}

export async function editarCliente(
  id: string,
  input: CustomerInput,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database
    .from("customers")
    .update(clean(input))
    .eq("id", id);
  if (error) {
    if (/duplicate|unique/i.test(error.message ?? ""))
      throw new Error("Ya existe un cliente con ese teléfono");
    throw new Error(error.message ?? "Error al guardar el cliente");
  }
}

// Soft archive / restore (keeps history intact).
export async function archivarCliente(id: string, activo: boolean): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database
    .from("customers")
    .update({ is_active: activo })
    .eq("id", id);
  if (error) throw new Error(error.message ?? "Error al archivar");
}

// Search active customers by name, phone or email (token-AND).
export async function buscarClientes(q: string): Promise<Customer[]> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const query = q.trim().toLowerCase();

  const insforge = await createInsForgeServerClient();
  const { data } = await insforge.database
    .from("customers")
    .select("id, nombre, telefono, email, descuento_pct, tipo, notas, is_active, created_at")
    .eq("is_active", true)
    .order("nombre", { ascending: true })
    .limit(500);

  const rows = (data ?? []) as Customer[];
  if (!query) return rows;
  const tokens = query.split(/\s+/).filter(Boolean);
  return rows.filter((c) => {
    const hay = `${c.nombre} ${c.telefono ?? ""} ${c.email ?? ""}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}
