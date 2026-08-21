"use server";

import { slugify } from "@/lib/slug";
import { assertPermiso } from "@/lib/auth/profile";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { toCents } from "@/lib/money";
import { type ExtractedRow, type ImportSource } from "./schema";
import { extractRowsFromImage, extractRowsFromPdf } from "./extract";

// Inventory import/creation needs inventory management (admin_total passes).
async function requireAdmin(): Promise<string> {
  return assertPermiso("inventario_gestionar");
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

// What the `quantity` column in a file means. See the commit_import migration.
//   alta      goods arrived — add to what we have (a delivery, a photo, a PO)
//   espejo    the file IS the stock — set ours to match (their ERP owns it)
//   catalogo  ignore quantity, update only names/prices/costs (we own stock)
export type ModoImport = "alta" | "espejo" | "catalogo";

export type CommitResult = {
  inserted: number;
  updated: number;
  movidos: number; // productos cuya existencia cambió
  bajas: number; // de esos, cuántos bajaron — la señal de alarma en espejo
  sin_precio: number; // entran visibles pero no vendibles
};

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
  modo: ModoImport = "alta",
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
    p_modo: modo,
  });

  if (error) throw new Error(error.message ?? "Error al importar");
  const d = (data ?? {}) as Partial<CommitResult>;
  return {
    inserted: Number(d.inserted ?? 0),
    updated: Number(d.updated ?? 0),
    movidos: Number(d.movidos ?? 0),
    bajas: Number(d.bajas ?? 0),
    sin_precio: Number(d.sin_precio ?? 0),
  };
}

/**
 * What an import WOULD do, without writing anything.
 *
 * `espejo` is the only mode that can destroy data — it overwrites stock, so
 * running it after the ERP cutover erases every sale the POS recorded since the
 * file was exported. Those losses look exactly like ordinary stock corrections
 * in the result counters, which is why they have to be visible BEFORE the write,
 * itemised, not as a number to skim past.
 */
export type Preview = {
  nuevos: number;
  existentes: number;
  sinPrecio: number;
  suben: number;
  bajan: number;
  igual: number;
  bajasTop: { sku: string; name: string; de: number; a: number }[];
};

export async function previewImport(
  rows: ExtractedRow[],
  inventoryId: string,
  modo: ModoImport,
): Promise<Preview> {
  await requireAdmin();
  if (!inventoryId) throw new Error("Selecciona un inventario destino");
  const payload = buildPayload(rows);

  const insforge = await createInsForgeServerClient();
  const { data } = await insforge.database
    .from("products")
    .select("sku, name, quantity")
    .eq("inventory_id", inventoryId);
  const actual = new Map(
    ((data ?? []) as { sku: string; name: string; quantity: number }[]).map((p) => [
      p.sku,
      p,
    ]),
  );

  const out: Preview = {
    nuevos: 0,
    existentes: 0,
    sinPrecio: 0,
    suben: 0,
    bajan: 0,
    igual: 0,
    bajasTop: [],
  };
  for (const r of payload) {
    const prev = actual.get(r.sku);
    if (!prev) out.nuevos++;
    else out.existentes++;
    if (!r.price_cents) out.sinPrecio++;

    if (modo === "catalogo") continue;
    const desde = prev?.quantity ?? 0;
    const hasta = modo === "espejo" ? r.quantity : desde + r.quantity;
    if (hasta > desde) out.suben++;
    else if (hasta < desde) {
      out.bajan++;
      out.bajasTop.push({ sku: r.sku, name: prev?.name ?? r.name ?? r.sku, de: desde, a: hasta });
    } else out.igual++;
  }
  out.bajasTop.sort((a, b) => b.de - b.a - (a.de - a.a)).splice(20);
  return out;
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
): Promise<{ id: string }> {
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

  // The form attaches the photo AFTER the product exists, so it needs the id.
  // commit_import returns aggregate jsonb, not rows — but the sku it wrote is
  // deterministic (given, or slugified name), so the lookup is exact.
  const { data } = await insforge.database
    .from("products")
    .select("id")
    .eq("inventory_id", inventoryId)
    .eq("sku", payload[0].sku)
    .maybeSingle();
  const id = (data as { id: string } | null)?.id;
  if (!id) throw new Error("El producto se guardó pero no se pudo recuperar");
  return { id };
}
