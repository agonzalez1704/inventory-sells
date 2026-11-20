"use server";

import { auth } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { attempt, type ActionResult } from "@/lib/errors";
import { notifyAdmins } from "@/lib/push";
import { getProfile } from "@/lib/auth/profile";
import { CUSTOMER_COLS } from "./cols";
import { customerInputSchema } from "./schema";

export type CustomerTipo = "publico" | "mayoreo" | "tecnico";
export type FormaPago = "contado" | "contra_entrega" | "credito";


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
  /** Número de cliente del negocio (automático, editable). Null en Mostrador. */
  numero?: number | null;
  /** Quien paga, cuando no es quien pide (taller: el dueño). */
  encargado?: string | null;
  direccion?: string | null;
  referencias?: string | null;
  /** Enlace de Maps o "lat,lng". */
  ubicacion?: string | null;
  /** Ruta o almacén que lo surte. */
  inventory_id?: string | null;
  forma_pago?: FormaPago | null;
  /** Bloqueo manual de crédito (solo admin). */
  bloqueo_motivo?: string | null;
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
  /** Null on create = the next number. Null on edit = keep the current one. */
  numero?: number | null;
  encargado?: string | null;
  direccion?: string | null;
  referencias?: string | null;
  ubicacion?: string | null;
  inventory_id?: string | null;
  forma_pago?: FormaPago | null;
  bloqueo_motivo?: string | null;
};

// Normalize + validate the shared shape used by create/edit. Same schema as
// the form, so a bypassed client meets the same rules.
function clean(input: CustomerInput) {
  const r = customerInputSchema.safeParse(input);
  if (!r.success) throw new Error(r.error.issues[0]?.message ?? "Datos inválidos");
  const { numero, ...d } = r.data;
  return {
    ...(numero != null ? { numero } : {}), // null on edit = keep the current one
    nombre: d.nombre,
    telefono: d.telefono,
    email: d.email ?? null,
    descuento_pct: Math.round(d.descuento_pct * 100) / 100,
    tipo: d.tipo,
    notas: d.notas ?? null,
    credito_dias: d.credito_dias,
    credito_limite_cents: d.credito_limite_cents,
    encargado: d.encargado ?? null,
    direccion: d.direccion ?? null,
    referencias: d.referencias ?? null,
    ubicacion: d.ubicacion ?? null,
    inventory_id: d.inventory_id ?? null,
    forma_pago: d.forma_pago ?? null,
    bloqueo_motivo: d.bloqueo_motivo ?? null,
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
  vencido_cents: number;
  notas_vencidas: number;
  dias_mas_vieja: number;
  liberado_hoy: boolean;
  bloqueo_motivo: string | null;
};

/** Everything one customer's numbers say: bought, owed, and how many notes. */
export async function resumenCliente(customerId: string): Promise<ResumenCliente> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const insforge = await createInsForgeServerClient();
  const [{ data, error }, { data: cust }, { data: est }] = await Promise.all([
    insforge.database.rpc("resumen_cliente", { p_customer_id: customerId }),
    insforgeAdmin.database
      .from("customers")
      .select("credito_dias, credito_limite_cents")
      .eq("id", customerId)
      .single(),
    insforge.database.rpc("credito_estado", { p_customer_id: customerId }),
  ]);
  if (error) throw new Error(error.message ?? "No se pudo leer el resumen");
  const r = (Array.isArray(data) ? data[0] : data) as Partial<ResumenCliente> | undefined;
  const c = cust as { credito_dias: number | null; credito_limite_cents: number | null } | null;
  const e = (Array.isArray(est) ? est[0] : est) as
    | { vencido_cents: number; notas_vencidas: number; dias_mas_vieja: number; liberado_hoy: boolean; bloqueo_motivo: string | null }
    | undefined;
  return {
    comprado_cents: Number(r?.comprado_cents ?? 0),
    compras: Number(r?.compras ?? 0),
    ultima_compra: r?.ultima_compra ?? null,
    deuda_cents: Number(r?.deuda_cents ?? 0),
    notas_pendientes: Number(r?.notas_pendientes ?? 0),
    credito_dias: c?.credito_dias ?? null,
    credito_limite_cents: c?.credito_limite_cents != null ? Number(c.credito_limite_cents) : null,
    vencido_cents: Number(e?.vencido_cents ?? 0),
    notas_vencidas: Number(e?.notas_vencidas ?? 0),
    dias_mas_vieja: Number(e?.dias_mas_vieja ?? 0),
    liberado_hoy: !!e?.liberado_hoy,
    bloqueo_motivo: e?.bloqueo_motivo ?? null,
  };
}

/** Admin: this customer may take credit until midnight (Mexico time). */
export async function liberarCreditoHoy(customerId: string): Promise<ActionResult> {
  return attempt("liberarCreditoHoy", async () => {
    const { userId } = await auth();
    if (!userId) throw new Error("No autenticado");
    const insforge = await createInsForgeServerClient();
    const { error } = await insforge.database.rpc("liberar_credito_hoy", { p_customer_id: customerId });
    if (error) throw new Error(error.message ?? "No se pudo liberar");
    return null;
  });
}

/** Non-admin at the till: ask the admins to release this customer for today. */
export async function pedirLiberacion(customerId: string, motivo: string): Promise<ActionResult> {
  return attempt("pedirLiberacion", async () => {
    const { userId } = await auth();
    if (!userId) throw new Error("No autenticado");
    const [{ data: c }, quien] = await Promise.all([
      insforgeAdmin.database.from("customers").select("numero, nombre").eq("id", customerId).maybeSingle(),
      getProfile(userId),
    ]);
    const cli = c as { numero: number | null; nombre: string } | null;
    if (!cli) throw new Error("Cliente no encontrado");
    await notifyAdmins("fiado", {
      title: `Liberar crédito: ${cli.numero != null ? `#${cli.numero} ` : ""}${cli.nombre}`,
      body: `${quien?.full_name || "Caja"} lo pide. ${motivo}`.slice(0, 180),
      url: `/clientes?q=${encodeURIComponent(cli.numero != null ? String(cli.numero) : cli.nombre)}`,
    });
    return null;
  });
}

// The unique index on numero and the phone triggers both say "duplicate".
function mensajeGuardar(msg: string | undefined, fallback: string): string {
  if (/customers_numero_key/i.test(msg ?? "")) return "Ese número de cliente ya lo tiene otro cliente";
  if (/duplicate|unique/i.test(msg ?? "")) return "Ya existe un cliente con ese teléfono";
  return msg || fallback;
}

export async function crearCliente(input: CustomerInput): Promise<ActionResult<{ id: string }>> {
  return attempt("crearCliente", async () => {
    const { userId } = await auth();
    if (!userId) throw new Error("No autenticado");

    const insforge = await createInsForgeServerClient();
    const { data, error } = await insforge.database
      .from("customers")
      .insert([clean(input)])
      .select("id")
      .single();

    if (error) throw new Error(mensajeGuardar(error.message, "Error al crear el cliente"));
    return { id: (data as { id: string }).id };
  });
}

export async function editarCliente(id: string, input: CustomerInput): Promise<ActionResult> {
  return attempt("editarCliente", async () => {
    const { userId } = await auth();
    if (!userId) throw new Error("No autenticado");

    const insforge = await createInsForgeServerClient();
    await assertNotSystem(insforge, id);
    const { error } = await insforge.database
      .from("customers")
      .update(clean(input))
      .eq("id", id);
    if (error) throw new Error(mensajeGuardar(error.message, "Error al guardar el cliente"));
    return null;
  });
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
    .select(CUSTOMER_COLS)
    .eq("is_active", true)
    .order("nombre", { ascending: true })
    .limit(500);

  const rows = (data ?? []) as Customer[];
  if (!query) return rows;
  const tokens = query.split(/\s+/).filter(Boolean);
  return rows.filter((c) => {
    const extras = (c.customer_phones ?? []).map((p) => p.telefono).join(" ");
    return tokens.every((t) => textoBusqueda(c, extras).includes(t));
  });
}

/** What a customer search matches on: number, name, phones, email. */
function textoBusqueda(c: Customer, extras: string): string {
  return `${c.numero != null ? `#${c.numero} ${c.numero}` : ""} ${c.nombre} ${c.telefono ?? ""} ${extras} ${c.email ?? ""}`.toLowerCase();
}

export type ResultadoFusion = {
  ventas: number;
  cotizaciones: number;
  saldo_movs: number;
  garantias: number;
  telefonos: number;
};

/**
 * Two records, one person: move everything onto the one that stays.
 *
 * Nothing is deleted — sales, quotes, store credit and warranties are
 * re-pointed, the other numbers become extra phones, and the absorbed record
 * is archived pointing at its survivor. Admin only, enforced by the RPC.
 */
export async function fusionarClientes(
  conservarId: string,
  absorberId: string,
): Promise<ActionResult<ResultadoFusion>> {
  return attempt("fusionarClientes", async () => {
    const { userId } = await auth();
    if (!userId) throw new Error("No autenticado");
    const insforge = await createInsForgeServerClient();
    const { data, error } = await insforge.database.rpc("fusionar_clientes", {
      p_conservar: conservarId,
      p_absorber: absorberId,
    });
    if (error) throw new Error(error.message ?? "No se pudieron combinar");
    const row = (Array.isArray(data) ? data[0] : data) as ResultadoFusion | undefined;
    return row ?? { ventas: 0, cotizaciones: 0, saldo_movs: 0, garantias: 0, telefonos: 0 };
  });
}
