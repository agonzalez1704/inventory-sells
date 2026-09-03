"use server";

import { randomUUID } from "node:crypto";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { assertPermiso } from "@/lib/auth/profile";
import { attempt, type ActionResult } from "@/lib/errors";

// Proof of payment for transfers: reference text and/or the screenshot shown
// at the counter. The image lives in the PRIVATE "comprobantes" bucket and is
// only ever served through short-lived signed URLs — a payment proof is not a
// product photo.

const BUCKET = "comprobantes";
const MAX_BYTES = 8 * 1024 * 1024;
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function guardar(
  dueno: { sale_id: string } | { adelanto_id: string },
  referencia: string | null,
  form?: FormData,
): Promise<null> {
  const userId = await assertPermiso("pos_vender");
  const ref = referencia?.trim() || null;
  const file = form?.get("file");
  const conImagen = file instanceof File && file.size > 0;
  if (!ref && !conImagen) throw new Error("Escribe la referencia o adjunta la captura");

  let key: string | null = null;
  if (conImagen) {
    if (file.size > MAX_BYTES) throw new Error("La imagen pesa más de 8 MB");
    const ext = MIME_EXT[file.type];
    if (!ext) throw new Error("Formato no válido (usa JPG, PNG o WebP)");
    const carpeta = "sale_id" in dueno ? dueno.sale_id : dueno.adelanto_id;
    key = `${carpeta}/${randomUUID()}.${ext}`;
    const { data, error } = await insforgeAdmin.storage.from(BUCKET).upload(key, file);
    if (error || !data) throw new Error(error?.message ?? "No se pudo subir la captura");
    key = data.key;
  }

  const { error } = await insforgeAdmin.database.from("comprobantes_pago").insert([
    { ...dueno, referencia: ref, imagen_key: key, created_by: userId },
  ]);
  if (error) throw new Error(error.message ?? "No se pudo guardar el comprobante");
  return null;
}

/**
 * Attach a proof to a sale AFTER the payment was registered — the sale must
 * never fail because a photo did. Accepts reference text, an image, or both.
 */
export async function guardarComprobante(
  saleId: string,
  referencia: string | null,
  form?: FormData,
): Promise<ActionResult<null>> {
  return attempt("guardarComprobante", () => guardar({ sale_id: saleId }, referencia, form));
}

/** Same, for an adelanto's abono. */
export async function guardarComprobanteAdelanto(
  adelantoId: string,
  referencia: string | null,
  form?: FormData,
): Promise<ActionResult<null>> {
  return attempt("guardarComprobanteAdelanto", () =>
    guardar({ adelanto_id: adelantoId }, referencia, form),
  );
}

export type Comprobante = {
  id: string;
  referencia: string | null;
  /** Signed, short-lived. Null when the row is text-only. */
  imagen_url: string | null;
  created_at: string;
};

async function listar(campo: "sale_id" | "adelanto_id" | "orden_id", id: string): Promise<Comprobante[]> {
  await assertPermiso("pos_vender");
  const { data } = await insforgeAdmin.database
    .from("comprobantes_pago")
    .select("id, referencia, imagen_key, created_at")
    .eq(campo, id)
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as {
    id: string; referencia: string | null; imagen_key: string | null; created_at: string;
  }[];
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      referencia: r.referencia,
      created_at: r.created_at,
      imagen_url: r.imagen_key
        ? (await insforgeAdmin.storage.from(BUCKET).createSignedUrl(r.imagen_key, 3600)).data
            ?.signedUrl ?? null
        : null,
    })),
  );
}

/** A sale's proofs, images signed for the next hour. */
export async function comprobantesDeVenta(saleId: string): Promise<Comprobante[]> {
  return listar("sale_id", saleId);
}

/** An adelanto's proofs. */
export async function comprobantesDeAdelanto(adelantoId: string): Promise<Comprobante[]> {
  return listar("adelanto_id", adelantoId);
}

/** A pending web order's proofs — what the admin checks before confirming. */
export async function comprobantesDeOrden(ordenId: string): Promise<Comprobante[]> {
  return listar("orden_id", ordenId);
}
