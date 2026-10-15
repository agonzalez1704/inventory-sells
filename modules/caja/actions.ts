"use server";

import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { getProfile, assertPermiso } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { attempt, type ActionResult } from "@/lib/errors";
import type { PaymentMethod } from "@/lib/types";

// Deposit proofs live next to the transfer proofs: private bucket, signed URLs.
const BUCKET = "comprobantes";
const MAX_BYTES = 8 * 1024 * 1024;
const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Cash taken out of the drawer and deposited to one of the shop's accounts.
 * Not an expense: the corte shows it apart and under the receiving account.
 * A proof (reference and/or the deposit slip) is required — that is the
 * whole point of registering it instead of just noting the cash is short.
 */
export async function registrarDeposito(form: FormData): Promise<ActionResult<null>> {
  return attempt("registrarDeposito", async () => {
    const userId = await assertPermiso("caja_movimientos");
    const monto = Math.round(Number(form.get("monto_cents")));
    const cuentaId = String(form.get("cuenta_id") ?? "");
    const referencia = String(form.get("referencia") ?? "").trim() || null;
    const file = form.get("file");
    const conImagen = file instanceof File && file.size > 0;
    if (!Number.isFinite(monto) || monto <= 0) throw new Error("Monto inválido");
    if (!cuentaId) throw new Error("¿A qué cuenta se depositó?");
    if (!referencia && !conImagen) throw new Error("Adjunta la ficha de depósito o escribe la referencia");

    const { data: cta } = await insforgeAdmin.database.from("cuentas_negocio").select("alias").eq("id", cuentaId).maybeSingle();
    const alias = (cta as { alias: string } | null)?.alias;
    if (!alias) throw new Error("Esa cuenta ya no existe");

    let key: string | null = null;
    if (conImagen) {
      if (file.size > MAX_BYTES) throw new Error("La imagen pesa más de 8 MB");
      const ext = MIME_EXT[file.type];
      if (!ext) throw new Error("Formato no válido (usa JPG, PNG o WebP)");
      const { data, error } = await insforgeAdmin.storage.from(BUCKET).upload(`depositos/${randomUUID()}.${ext}`, file);
      if (error || !data) throw new Error(error?.message ?? "No se pudo subir la ficha");
      key = data.key;
    }

    const { error } = await insforgeAdmin.database.from("gastos").insert([
      {
        concepto: `Depósito a ${alias}`,
        monto_cents: monto,
        metodo: "efectivo",
        categoria: "Depósito",
        cuenta_id: cuentaId,
        referencia,
        comprobante_key: key,
        created_by: userId,
      },
    ]);
    if (error) throw new Error(error.message ?? "No se pudo registrar el depósito");
    return null;
  });
}

/** Short-lived link to a deposit's slip, for whoever reviews the corte. */
export async function urlComprobanteGasto(gastoId: string): Promise<ActionResult<string>> {
  return attempt("urlComprobanteGasto", async () => {
    await assertPermiso("caja_movimientos");
    const { data } = await insforgeAdmin.database.from("gastos").select("comprobante_key").eq("id", gastoId).maybeSingle();
    const key = (data as { comprobante_key: string | null } | null)?.comprobante_key;
    if (!key) throw new Error("Este movimiento no tiene ficha adjunta");
    const { data: signed, error } = await insforgeAdmin.storage.from(BUCKET).createSignedUrl(key, 600);
    if (error || !signed) throw new Error(error?.message ?? "No se pudo abrir la ficha");
    return signed.signedUrl;
  });
}

export async function registrarGasto(input: {
  concepto: string;
  monto_cents: number;
  metodo: PaymentMethod;
  categoria: string | null;
}): Promise<void> {
  await assertPermiso("caja_movimientos");
  if (!input.concepto.trim()) throw new Error("Falta el concepto");
  if (!Number.isFinite(input.monto_cents) || input.monto_cents <= 0) {
    throw new Error("Monto inválido");
  }

  const insforge = await createInsForgeServerClient();
  // created_by is filled by its column DEFAULT (requesting_user_id()).
  const { error } = await insforge.database.from("gastos").insert([
    {
      concepto: input.concepto.trim(),
      monto_cents: Math.round(input.monto_cents),
      metodo: input.metodo,
      categoria: input.categoria?.trim() || null,
    },
  ]);
  if (error) throw new Error(error.message ?? "Error al registrar el gasto");
}

export async function eliminarGasto(id: string): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin") throw new Error("Solo administradores");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database.from("gastos").delete().eq("id", id);
  if (error) throw new Error(error.message ?? "Error al eliminar el gasto");
}

// Extra income not tied to a product sale (e.g. screen installation).
export async function registrarIngreso(input: {
  concepto: string;
  monto_cents: number;
  metodo: PaymentMethod;
  categoria: string | null;
}): Promise<void> {
  await assertPermiso("caja_movimientos");
  if (!input.concepto.trim()) throw new Error("Falta el concepto");
  if (!Number.isFinite(input.monto_cents) || input.monto_cents <= 0) {
    throw new Error("Monto inválido");
  }

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database.from("ingresos").insert([
    {
      concepto: input.concepto.trim(),
      monto_cents: Math.round(input.monto_cents),
      metodo: input.metodo,
      categoria: input.categoria?.trim() || null,
    },
  ]);
  if (error) throw new Error(error.message ?? "Error al registrar el ingreso");
}

export async function eliminarIngreso(id: string): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin") throw new Error("Solo administradores");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database.from("ingresos").delete().eq("id", id);
  if (error) throw new Error(error.message ?? "Error al eliminar el ingreso");
}
