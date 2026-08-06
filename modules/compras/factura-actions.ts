"use server";

import * as XLSX from "xlsx";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { assertPermiso } from "@/lib/auth/profile";
import { toCents } from "@/lib/money";
import { searchProducts, tokensDeConsulta, expand } from "@/lib/search";
import { esPlantilla, leerPlantilla } from "@/lib/plantilla-compra";
import {
  costoUnitario,
  extraerFacturaDeImagen,
  extraerFacturaDePdf,
  type LineaFactura,
} from "./extraer-factura";

const BUCKET = process.env.INSFORGE_BUCKET ?? "fiable";
const MAX_BYTES = 10 * 1024 * 1024;

/** How a proposed line found its product. Drives what the reviewer must check. */
export type Origen =
  | "sku" // our own SKU, from the template — exact
  | "equivalencia" // supplier code we have seen before — exact
  | "busqueda" // matched on text — NEEDS EYES
  | "sin_match"; // nothing found

export type LineaPropuesta = {
  /** Line number in the source document, so a problem can be pointed at. */
  ref: number;
  descripcion: string;
  skuProveedor: string;
  cantidad: number;
  /** Pesos. null when the document never showed one. */
  costo: number | null;
  pedido: number | null;
  productId: string | null;
  productoNombre: string | null;
  productoSku: string | null;
  origen: Origen;
};

export type AnalisisFactura = {
  /** "plantilla" is read deterministically; the others are inferred. */
  modo: "plantilla" | "hoja_libre" | "documento";
  folio: string | null;
  lineas: LineaPropuesta[];
  /** Rows the reader skipped, and why. Never swallowed silently. */
  ignoradas: { fila: number; motivo: string }[];
};

const esImagen = (t: string) => t.startsWith("image/");
const esPdf = (t: string) => t === "application/pdf";
const esHoja = (nombre: string, tipo: string) =>
  /\.(xlsx|xls|csv)$/i.test(nombre) ||
  tipo.includes("spreadsheet") ||
  tipo.includes("excel") ||
  tipo === "text/csv";

/** Resolve our own SKUs in bulk. */
async function porSku(skus: string[]) {
  const limpios = [...new Set(skus.filter(Boolean))];
  if (!limpios.length) return new Map<string, { id: string; sku: string; name: string }>();
  const { data } = await insforgeAdmin.database
    .from("products")
    .select("id, sku, name")
    .in("sku", limpios);
  return new Map(
    ((data ?? []) as { id: string; sku: string; name: string }[]).map((p) => [p.sku, p]),
  );
}

/** Supplier codes we have already been taught. */
async function equivalencias(proveedorId: string, skus: string[]) {
  const limpios = [...new Set(skus.filter(Boolean))];
  if (!limpios.length || !proveedorId) return new Map<string, string>();
  const { data } = await insforgeAdmin.database
    .from("proveedor_skus")
    .select("sku_proveedor, product_id")
    .eq("proveedor_id", proveedorId)
    .in("sku_proveedor", limpios);
  return new Map(
    ((data ?? []) as { sku_proveedor: string; product_id: string }[]).map((r) => [
      r.sku_proveedor,
      r.product_id,
    ]),
  );
}

/**
 * Best product for a free-text description, or null.
 *
 * Only ever a SUGGESTION: it is returned tagged `busqueda` so the reviewer knows
 * this one was guessed. Auto-accepting a text match would put stock on the wrong
 * product and build a cost layer against it — wrong in a way that shows up as a
 * margin, not as an error.
 */
async function porTexto(texto: string) {
  const tokens = tokensDeConsulta(texto);
  if (!tokens.length) return null;
  const { data } = await insforgeAdmin.database.rpc("buscar_productos_candidatos", {
    p_tokens: tokens.map(expand),
    p_inventory_id: null,
    p_categoria: null,
    p_limit: 200,
  });
  const hit = searchProducts(
    (data ?? []) as { id: string; sku: string; name: string; quantity: number }[],
    texto,
    { limit: 1 },
  )[0];
  return hit ?? null;
}

async function proponer(
  proveedorId: string,
  crudas: {
    ref: number;
    descripcion: string;
    skuProveedor: string;
    skuPropio: string;
    cantidad: number;
    costo: number | null;
    pedido: number | null;
  }[],
): Promise<LineaPropuesta[]> {
  const [mapSku, mapEq] = await Promise.all([
    porSku(crudas.map((c) => c.skuPropio)),
    equivalencias(proveedorId, crudas.map((c) => c.skuProveedor)),
  ]);

  const idsEq = [...new Set([...mapEq.values()])];
  const { data: prodsEq } = idsEq.length
    ? await insforgeAdmin.database.from("products").select("id, sku, name").in("id", idsEq)
    : { data: [] };
  const porId = new Map(
    ((prodsEq ?? []) as { id: string; sku: string; name: string }[]).map((p) => [p.id, p]),
  );

  const out: LineaPropuesta[] = [];
  for (const c of crudas) {
    const base = {
      ref: c.ref,
      descripcion: c.descripcion,
      skuProveedor: c.skuProveedor,
      cantidad: c.cantidad,
      costo: c.costo,
      pedido: c.pedido,
    };

    const propio = mapSku.get(c.skuPropio);
    if (propio) {
      out.push({ ...base, productId: propio.id, productoNombre: propio.name, productoSku: propio.sku, origen: "sku" });
      continue;
    }
    const eqId = mapEq.get(c.skuProveedor);
    const eq = eqId ? porId.get(eqId) : undefined;
    if (eq) {
      out.push({ ...base, productId: eq.id, productoNombre: eq.name, productoSku: eq.sku, origen: "equivalencia" });
      continue;
    }
    const adivinado = await porTexto(c.descripcion || c.skuProveedor);
    out.push(
      adivinado
        ? { ...base, productId: adivinado.id, productoNombre: adivinado.name, productoSku: adivinado.sku, origen: "busqueda" }
        : { ...base, productId: null, productoNombre: null, productoSku: null, origen: "sin_match" },
    );
  }
  return out;
}

/**
 * Read an uploaded document into proposed lines. Writes nothing.
 *
 * The format is detected rather than declared: a recognised template is parsed
 * deterministically, any other sheet falls to the heuristic reader, and a PDF or
 * photo goes to the model. `modo` comes back so the screen can say which path it
 * took — a silent misread is the failure worth designing against.
 */
export async function analizarFactura(
  compraId: string,
  fd: FormData,
): Promise<AnalisisFactura> {
  await assertPermiso("inventario_gestionar");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Falta el archivo");
  if (file.size > MAX_BYTES) throw new Error("El archivo pesa más de 10 MB");

  const { data: compra } = await insforgeAdmin.database
    .from("compras")
    .select("proveedor_id, estado")
    .eq("id", compraId)
    .maybeSingle();
  const c = compra as { proveedor_id: string; estado: string } | null;
  if (!c) throw new Error("Compra no encontrada");
  if (c.estado !== "borrador")
    throw new Error(`La compra ya fue ${c.estado}; sólo un borrador acepta líneas`);

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (esHoja(file.name, file.type)) {
    const wb = XLSX.read(bytes, { type: "array" });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: "" });

    if (esPlantilla(grid)) {
      const { filas, ignoradas } = leerPlantilla(grid);
      const lineas = await proponer(
        c.proveedor_id,
        filas.map((f) => ({
          ref: f.fila,
          descripcion: f.producto,
          skuProveedor: f.skuProveedor,
          skuPropio: f.sku,
          cantidad: f.cantidad,
          costo: f.costo,
          pedido: f.pedido,
        })),
      );
      return { modo: "plantilla", folio: null, lineas, ignoradas };
    }

    // Not our template: say so loudly rather than guessing columns silently.
    throw new Error(
      "No reconocí el formato de la hoja. Descarga la plantilla y vacía ahí tus líneas, " +
        "o sube la factura como PDF o foto.",
    );
  }

  if (esPdf(file.type) || esImagen(file.type)) {
    const factura = esPdf(file.type)
      ? await extraerFacturaDePdf(bytes)
      : await extraerFacturaDeImagen(bytes, file.type);

    const crudas = factura.lineas
      .map((l: LineaFactura, i) => ({
        ref: i + 1,
        descripcion: (l.descripcion ?? "").trim(),
        skuProveedor: (l.sku_proveedor ?? "").trim(),
        skuPropio: "",
        cantidad: Math.round(l.cantidad ?? 0),
        costo: costoUnitario(l),
        pedido: null as number | null,
      }))
      .filter((l) => l.cantidad > 0 && (l.descripcion || l.skuProveedor));

    const lineas = await proponer(c.proveedor_id, crudas);
    return {
      modo: "documento",
      folio: factura.folio?.trim() || null,
      lineas,
      ignoradas: [],
    };
  }

  throw new Error("Formato no soportado. Usa Excel, CSV, PDF o una foto.");
}

/** Store the document on the purchase. Separate from reading it: a shop may want
 *  the invoice on file even when the lines were typed by hand. */
export async function subirFactura(
  compraId: string,
  fd: FormData,
): Promise<{ url: string }> {
  await assertPermiso("inventario_gestionar");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Falta el archivo");
  if (file.size > MAX_BYTES) throw new Error("El archivo pesa más de 10 MB");

  const ext = (file.name.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? "bin").toLowerCase();
  const key = `facturas/${compraId}.${ext}`;

  const { data: prev } = await insforgeAdmin.database
    .from("compras")
    .select("factura_key")
    .eq("id", compraId)
    .maybeSingle();
  const prevKey = (prev as { factura_key?: string | null } | null)?.factura_key;
  // Upload doesn't overwrite, and a prior key with another extension would linger.
  for (const k of new Set([key, prevKey].filter(Boolean) as string[])) {
    await insforgeAdmin.storage.from(BUCKET).remove(k).catch(() => {});
  }

  const { data, error } = await insforgeAdmin.storage.from(BUCKET).upload(key, file);
  if (error || !data) throw new Error(error?.message ?? "No se pudo subir la factura");

  const { error: upErr } = await insforgeAdmin.database
    .from("compras")
    .update({ factura_url: data.url, factura_key: data.key, factura_nombre: file.name })
    .eq("id", compraId);
  if (upErr) throw new Error(upErr.message ?? "No se pudo guardar la factura");

  return { url: data.url };
}

export type LineaConfirmada = {
  productId: string;
  cantidad: number;
  costo: number | null;
  pedido: number | null;
  /** Present when the reviewer resolved a supplier code; remembered for next time. */
  skuProveedor?: string;
};

/**
 * Write the reviewed lines onto the draft.
 *
 * Everything here has been through human eyes — analizarFactura only proposes.
 * Correcting a line also teaches the supplier-code equivalence, so the same
 * invoice next month matches without help.
 */
export async function aplicarLineas(
  compraId: string,
  lineas: LineaConfirmada[],
): Promise<{ agregadas: number; recordadas: number }> {
  await assertPermiso("inventario_gestionar");
  if (!lineas.length) throw new Error("Sin líneas para agregar");

  const { data: compra } = await insforgeAdmin.database
    .from("compras")
    .select("proveedor_id, estado")
    .eq("id", compraId)
    .maybeSingle();
  const c = compra as { proveedor_id: string; estado: string } | null;
  if (!c) throw new Error("Compra no encontrada");
  if (c.estado !== "borrador")
    throw new Error(`La compra ya fue ${c.estado}; sólo un borrador se puede editar`);

  const validas = lineas.filter(
    (l) => l.productId && Number.isInteger(l.cantidad) && l.cantidad > 0,
  );
  if (!validas.length) throw new Error("Ninguna línea válida");

  // One line per product per purchase, same rule the manual capture follows.
  await insforgeAdmin.database
    .from("compra_items")
    .delete()
    .eq("compra_id", compraId)
    .in("product_id", validas.map((l) => l.productId));

  const { error } = await insforgeAdmin.database.from("compra_items").insert(
    validas.map((l) => ({
      compra_id: compraId,
      product_id: l.productId,
      qty: l.cantidad,
      qty_pedida: l.pedido,
      costo_unitario_cents: l.costo != null ? Math.max(0, toCents(l.costo)) : 0,
    })),
  );
  if (error) throw new Error(error.message ?? "No se pudieron agregar las líneas");

  // Teach the equivalences through the RPC: the table's created_by defaults to
  // requesting_user_id(), which is NULL under the admin client.
  const insforge = await createInsForgeServerClient();
  const aRecordar = validas.filter((l) => l.skuProveedor?.trim());
  await Promise.all(
    aRecordar.map((l) =>
      insforge.database.rpc("recordar_sku_proveedor", {
        p_proveedor_id: c.proveedor_id,
        p_sku: l.skuProveedor!.trim(),
        p_product_id: l.productId,
      }),
    ),
  );

  return { agregadas: validas.length, recordadas: aRecordar.length };
}
