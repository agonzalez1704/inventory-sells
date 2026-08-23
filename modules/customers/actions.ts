"use server";

import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { insforgeAdmin } from "@/lib/insforge/admin";

export type CustomerTipo = "publico" | "mayoreo" | "tecnico";

export type CustomerPhone = {
  id: string;
  telefono: string;
  etiqueta: string | null;
};

export type Customer = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  descuento_pct: number;
  tipo: CustomerTipo;
  notas: string | null;
  /** Días de plazo de sus notas de crédito. Null = sin línea formal. */
  credito_dias: number | null;
  /** Tope de deuda en notas de crédito. Null = sin tope. */
  credito_limite_cents: number | null;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
  customer_phones?: CustomerPhone[];
};

// The seeded "Mostrador" walk-in is a system row — not editable/archivable.
async function assertNotSystem(
  insforge: Awaited<ReturnType<typeof createInsForgeServerClient>>,
  id: string,
) {
  const { data } = await insforge.database
    .from("customers")
    .select("is_system")
    .eq("id", id)
    .maybeSingle();
  if ((data as { is_system?: boolean } | null)?.is_system)
    throw new Error("El cliente Mostrador no se puede modificar");
}

export type CustomerInput = {
  nombre: string;
  telefono: string | null;
  email: string | null;
  descuento_pct: number;
  tipo: CustomerTipo;
  notas: string | null;
  credito_dias: number | null;
  credito_limite_cents: number | null;
};

// Normalize + validate the shared shape used by create/edit.
function clean(input: CustomerInput) {
  const nombre = input.nombre.trim();
  if (!nombre) throw new Error("Falta el nombre");
  const telefono = input.telefono?.trim() || "";
  if (telefono.replace(/\D/g, "").length < 10)
    throw new Error("Teléfono obligatorio (al menos 10 dígitos)");
  const pct = Number(input.descuento_pct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100)
    throw new Error("Descuento inválido (0–100)");
  const dias = input.credito_dias;
  if (dias != null && (!Number.isInteger(dias) || dias <= 0 || dias > 365))
    throw new Error("Días de crédito inválidos (1–365)");
  const limite = input.credito_limite_cents;
  if (limite != null && (!Number.isInteger(limite) || limite <= 0))
    throw new Error("Límite de crédito inválido");
  return {
    nombre,
    telefono,
    email: input.email?.trim() || null,
    descuento_pct: Math.round(pct * 100) / 100,
    tipo: input.tipo,
    notas: input.notas?.trim() || null,
    credito_dias: dias,
    credito_limite_cents: limite,
  };
}

export type ResumenCliente = {
  comprado_cents: number;
  compras: number;
  ultima_compra: string | null;
  deuda_cents: number;
  notas_pendientes: number;
  credito_dias: number | null;
  credito_limite_cents: number | null;
};

/** Everything one customer's numbers say: bought, owed, and how many notes. */
export async function resumenCliente(customerId: string): Promise<ResumenCliente> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const insforge = await createInsForgeServerClient();
  const [{ data, error }, { data: cust }] = await Promise.all([
    insforge.database.rpc("resumen_cliente", { p_customer_id: customerId }),
    insforgeAdmin.database
      .from("customers")
      .select("credito_dias, credito_limite_cents")
      .eq("id", customerId)
      .single(),
  ]);
  if (error) throw new Error(error.message ?? "No se pudo leer el resumen");
  const r = (Array.isArray(data) ? data[0] : data) as Partial<ResumenCliente> | undefined;
  const c = cust as { credito_dias: number | null; credito_limite_cents: number | null } | null;
  return {
    comprado_cents: Number(r?.comprado_cents ?? 0),
    compras: Number(r?.compras ?? 0),
    ultima_compra: r?.ultima_compra ?? null,
    deuda_cents: Number(r?.deuda_cents ?? 0),
    notas_pendientes: Number(r?.notas_pendientes ?? 0),
    credito_dias: c?.credito_dias ?? null,
    credito_limite_cents: c?.credito_limite_cents != null ? Number(c.credito_limite_cents) : null,
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
  await assertNotSystem(insforge, id);
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
  await assertNotSystem(insforge, id);
  const { error } = await insforge.database
    .from("customers")
    .update({ is_active: activo })
    .eq("id", id);
  if (error) throw new Error(error.message ?? "Error al archivar");
}

// Additional phones (the primary lives in customers.telefono). DB triggers
// enforce that a normalized number exists only once across both tables.
export async function agregarTelefono(
  customerId: string,
  telefono: string,
  etiqueta: string | null,
): Promise<CustomerPhone> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const tel = telefono.trim();
  if (tel.replace(/\D/g, "").length < 10)
    throw new Error("Teléfono inválido (al menos 10 dígitos)");

  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database
    .from("customer_phones")
    .insert([{ customer_id: customerId, telefono: tel, etiqueta: etiqueta?.trim() || null }])
    .select("id, telefono, etiqueta")
    .single();
  if (error || !data) {
    if (/duplicate|unique|already registered/i.test(error?.message ?? ""))
      throw new Error("Ese teléfono ya está registrado");
    throw new Error(error?.message ?? "Error al agregar el teléfono");
  }
  return data as CustomerPhone;
}

export async function quitarTelefono(phoneId: string): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database
    .from("customer_phones")
    .delete()
    .eq("id", phoneId);
  if (error) throw new Error(error.message ?? "Error al quitar el teléfono");
}

// Search active customers by name, phone or email (token-AND).
export async function buscarClientes(q: string): Promise<Customer[]> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const query = q.trim().toLowerCase();

  const insforge = await createInsForgeServerClient();
  const { data } = await insforge.database
    .from("customers")
    .select(
      "id, nombre, telefono, email, descuento_pct, tipo, notas, credito_dias, credito_limite_cents, is_active, is_system, created_at, customer_phones(id, telefono, etiqueta)",
    )
    .eq("is_active", true)
    .order("nombre", { ascending: true })
    .limit(500);

  const rows = (data ?? []) as Customer[];
  if (!query) return rows;
  const tokens = query.split(/\s+/).filter(Boolean);
  return rows.filter((c) => {
    const extras = (c.customer_phones ?? []).map((p) => p.telefono).join(" ");
    const hay = `${c.nombre} ${c.telefono ?? ""} ${extras} ${c.email ?? ""}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}
