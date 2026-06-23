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

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Sanitize rows into the DB payload: require sku (derive from name if blank),
// convert pesos → centavos, round qty, clamp negatives.
function buildPayload(rows: ExtractedRow[]) {
  return rows
    .map((r) => ({
      ...r,
      sku: r.sku?.trim() || (r.name ? slugify(r.name) : ""),
    }))
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
}

export async function commitImport(
  rows: ExtractedRow[],
  source: ImportSource,
  filename: string | null,
  inventoryId: string,
): Promise<CommitResult> {
  await requireAdmin();
  if (!inventoryId) throw new Error("Selecciona un inventario destino");

  const payload = buildPayload(rows);
  if (payload.length === 0) throw new Error("Sin filas para importar");

  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database.rpc("commit_import", {
    p_rows: payload,
    p_source: source,
    p_filename: filename,
    p_inventory_id: inventoryId,
  });

  if (error) throw new Error(error.message ?? "Error al importar");
  return {
    inserted: Number((data as { inserted?: number })?.inserted ?? 0),
    updated: Number((data as { updated?: number })?.updated ?? 0),
  };
}

export type CreatedInventory = {
  inventory_id: string;
  name: string;
  inserted: number;
  updated: number;
};

// Create an inventory and import in one transaction. If the import has no valid
// rows or the RPC fails, no inventory is created.
export async function createInventoryWithImport(
  name: string,
  rows: ExtractedRow[],
  source: ImportSource,
  filename: string | null,
): Promise<CreatedInventory> {
  await requireAdmin();
  const clean = name.trim();
  if (!clean) throw new Error("El nombre es obligatorio");

  const payload = buildPayload(rows);
  if (payload.length === 0) throw new Error("Sin filas para importar");

  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database.rpc(
    "create_inventory_and_import",
    { p_name: clean, p_rows: payload, p_source: source, p_filename: filename },
  );
  if (error) throw new Error(error.message ?? "Error al crear el inventario");

  const d = data as Partial<CreatedInventory>;
  return {
    inventory_id: String(d?.inventory_id ?? ""),
    name: String(d?.name ?? clean),
    inserted: Number(d?.inserted ?? 0),
    updated: Number(d?.updated ?? 0),
  };
}

// Add a single product manually to an existing inventory.
export async function addProduct(
  inventoryId: string,
  row: ExtractedRow,
): Promise<void> {
  await requireAdmin();
  if (!inventoryId) throw new Error("Inventario requerido");

  const payload = buildPayload([row]);
  if (payload.length === 0) throw new Error("Falta el nombre o SKU");

  const insforge = await createInsForgeServerClient();
  const { error } = await insforge.database.rpc("commit_import", {
    p_rows: payload,
    p_source: "manual",
    p_filename: null,
    p_inventory_id: inventoryId,
  });
  if (error) throw new Error(error.message ?? "Error al agregar el producto");
}
