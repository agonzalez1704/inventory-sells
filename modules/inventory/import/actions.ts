"use server";

import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { toCents } from "@/lib/money";
import { type ExtractedRow, type ImportSource } from "./schema";
import { extractRowsFromImage, extractRowsFromPdf } from "./extract";

async function requireAdmin(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new Error("No autenticado");
  const profile = await getProfile(userId);
  if (profile?.role !== "admin") throw new Error("Solo administradores");
  return userId;
}

export type ExtractResult = {
  rows: ExtractedRow[];
  source: ImportSource;
  filename: string;
};

// Image / PDF → AI vision extraction. Spreadsheets are parsed in the browser.
export async function extractFromUpload(
  formData: FormData,
): Promise<ExtractResult> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Archivo faltante");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = file.type;

  let rows: ExtractedRow[];
  let source: ImportSource;
  if (type.startsWith("image/")) {
    rows = await extractRowsFromImage(bytes, type);
    source = "image";
  } else if (type === "application/pdf") {
    rows = await extractRowsFromPdf(bytes);
    source = "pdf";
  } else {
    throw new Error(`Tipo no soportado: ${type || "desconocido"}`);
  }

  return { rows, source, filename: file.name };
}

// Collapse attribute key/value pairs into a plain object for JSONB storage.
function attrsToObject(
  pairs: ExtractedRow["attributes"],
): Record<string, string> | undefined {
  if (!pairs || pairs.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const { key, value } of pairs) {
    const k = key?.trim();
    if (k) out[k] = String(value ?? "").trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export type CommitResult = { inserted: number; updated: number };

export async function commitImport(
  rows: ExtractedRow[],
  source: ImportSource,
  filename: string | null,
): Promise<CommitResult> {
  await requireAdmin();

  // Sanitize the (possibly edited) rows: require sku, round qty, clamp negatives.
  const payload = rows
    .map((r) => ({ ...r, sku: r.sku?.trim() ?? "" }))
    .filter((r) => r.sku !== "")
    .map((r) => {
      const attributes = attrsToObject(r.attributes);
      return {
        sku: r.sku,
        name: r.name?.trim() || null,
        brand: r.brand?.trim() || null,
        size: r.size?.trim() || null,
        color: r.color?.trim() || null,
        category: r.category?.trim() || null,
        cost_cents: r.cost != null && r.cost >= 0 ? toCents(r.cost) : null,
        price_cents: r.price != null && r.price >= 0 ? toCents(r.price) : null,
        quantity: r.quantity != null && r.quantity > 0 ? Math.round(r.quantity) : 0,
        // Omit when empty so the column keeps its NOT NULL '{}' default.
        ...(attributes ? { attributes } : {}),
      };
    });

  if (payload.length === 0) throw new Error("Sin filas para importar");

  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database.rpc("commit_import", {
    p_rows: payload,
    p_source: source,
    p_filename: filename,
  });

  if (error) throw new Error(error.message ?? "Error al importar");
  return {
    inserted: Number((data as { inserted?: number })?.inserted ?? 0),
    updated: Number((data as { updated?: number })?.updated ?? 0),
  };
}
