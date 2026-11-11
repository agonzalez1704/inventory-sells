"use server";

import { claveSku } from "@/lib/sku";
import * as XLSX from "xlsx";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { assertPermiso } from "@/lib/auth/profile";
import { toCents } from "@/lib/money";
import { attempt, type ActionResult } from "@/lib/errors";
import { searchProducts, tokensDeConsulta, expand } from "@/lib/search";
import { esPlantilla, leerPlantilla } from "@/lib/plantilla-compra";
import {
  costoUnitario,
  extraerFacturaDeImagen,
  extraerFacturaDePdf,
  type FacturaExtraida,
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
  /** What the matched product costs today, pesos — to see the new cost move. */
  costoActual: number | null;
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

/**
 * Resolve our own SKUs in bulk, in the destination inventory when there is one.
 * Without one the oldest row of each SKU wins (Mostrador, the canonical row).
 */
async function porSku(skus: string[], inventarioId: string | null) {
  const limpios = [...new Set(skus.filter(Boolean).map(claveSku))];
  if (!limpios.length) return new Map<string, Producto>();
  let q = insforgeAdmin.database.from("products").select("id, sku, name, cost_cents").in("sku", limpios);
  if (inventarioId) q = q.eq("inventory_id", inventarioId);
  const { data } = await q.order("created_at", { ascending: false });
  return new Map(((data ?? []) as Producto[]).map((p) => [p.sku, p]));
}

type Producto = { id: string; sku: string; name: string; cost_cents?: number | null };
const costoDe = (p: Producto) => (p.cost_cents != null ? p.cost_cents / 100 : null);

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
async function porTexto(texto: string, inventarioId: string | null) {
  const tokens = tokensDeConsulta(texto);
  if (!tokens.length) return null;
  const { data } = await insforgeAdmin.database.rpc("buscar_productos_candidatos", {
    p_tokens: tokens.map(expand),
    p_inventory_id: inventarioId,
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
  proveedorId: string | null,
  crudas: {
    ref: number;
    descripcion: string;
    skuProveedor: string;
    skuPropio: string;
    cantidad: number;
    costo: number | null;
    pedido: number | null;
  }[],
  inventarioId: string | null = null,
): Promise<LineaPropuesta[]> {
  // Our own SKU, or — many suppliers share the maker's numbering — the
  // supplier's code when it is also one of ours.
  const clave = (c: (typeof crudas)[number]) => c.skuPropio || c.skuProveedor;
  const [mapSku, mapEq] = await Promise.all([
    porSku(crudas.map(clave), inventarioId),
    equivalencias(proveedorId ?? "", crudas.map((c) => c.skuProveedor)),
  ]);

  // A taught equivalence points at one row; land it in the destination
  // inventory's row of the same SKU.
  const idsEq = [...new Set([...mapEq.values()])];
  const { data: prodsEq } = idsEq.length
    ? await insforgeAdmin.database.from("products").select("id, sku, name, cost_cents").in("id", idsEq)
    : { data: [] };
  const porId = new Map(((prodsEq ?? []) as Producto[]).map((p) => [p.id, p]));
  const enDestino = inventarioId
    ? await porSku(((prodsEq ?? []) as Producto[]).map((p) => p.sku), inventarioId)
    : new Map<string, Producto>();

  return Promise.all(
    crudas.map(async (c): Promise<LineaPropuesta> => {
      const base = {
        ref: c.ref,
        descripcion: c.descripcion,
        skuProveedor: c.skuProveedor,
        cantidad: c.cantidad,
        costo: c.costo,
        pedido: c.pedido,
      };
      const con = (p: Producto, origen: Origen): LineaPropuesta => ({
        ...base,
        productId: p.id,
        productoNombre: p.name,
        productoSku: p.sku,
        costoActual: costoDe(p),
        origen,
      });

      const propio = clave(c) ? mapSku.get(claveSku(clave(c))) : undefined;
      if (propio) return con(propio, "sku");
      const eqId = mapEq.get(c.skuProveedor);
      const eq = eqId ? porId.get(eqId) : undefined;
      if (eq) return con(enDestino.get(eq.sku) ?? eq, "equivalencia");
      const adivinado = await porTexto(c.descripcion || c.skuProveedor, inventarioId);
      return adivinado
        ? { ...base, productId: adivinado.id, productoNombre: adivinado.name, productoSku: adivinado.sku, costoActual: null, origen: "busqueda" }
        : { ...base, productId: null, productoNombre: null, productoSku: null, costoActual: null, origen: "sin_match" };
    }),
  );
}

/**
 * Read a document into proposed lines. Writes nothing.
 *
 * The format is detected rather than declared: a recognised template is parsed
 * deterministically, any other sheet is refused, and a PDF or photo goes to the
 * model. `modo` comes back so the screen can say which path it took — a silent
 * misread is the failure worth designing against. The supplier is resolved
 * after reading, since a new purchase learns it from the invoice itself.
 */
async function leerArchivo(
  fd: FormData,
  proveedorDe: (factura: FacturaExtraida | null) => Promise<string | null>,
  inventarioId: string | null,
): Promise<{ analisis: AnalisisFactura; factura: FacturaExtraida | null; proveedorId: string | null }> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Falta el archivo");
  if (file.size > MAX_BYTES) throw new Error("El archivo pesa más de 10 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (esHoja(file.name, file.type)) {
    const wb = XLSX.read(bytes, { type: "array" });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    const grid = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, defval: "" });

    // Not our template: say so loudly rather than guessing columns silently.
    if (!esPlantilla(grid))
      throw new Error(
        "No reconocí el formato de la hoja. Descarga la plantilla y vacía ahí tus líneas, " +
          "o sube la factura como PDF o foto.",
      );
    const { filas, ignoradas } = leerPlantilla(grid);
    const proveedorId = await proveedorDe(null);
    const lineas = await proponer(
      proveedorId,
      filas.map((f) => ({
        ref: f.fila,
        descripcion: f.producto,
        skuProveedor: f.skuProveedor,
        skuPropio: f.sku,
        cantidad: f.cantidad,
        costo: f.costo,
        // No explicit "Pedido" column means the sheet you uploaded IS the
        // requisition, so its quantity is what was ordered. Received starts
        // equal and is then corrected to what actually turned up — which is
        // what makes the shortfall visible on the counter-receipt. Leaving
        // this null instead gave a PDF with an empty "Pedido" column.
        pedido: f.pedido ?? f.cantidad,
      })),
      inventarioId,
    );
    return { analisis: { modo: "plantilla", folio: null, lineas, ignoradas }, factura: null, proveedorId };
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

    const proveedorId = await proveedorDe(factura);
    const lineas = await proponer(proveedorId, crudas, inventarioId);
    return {
      analisis: { modo: "documento", folio: factura.folio?.trim() || null, lineas, ignoradas: [] },
      factura,
      proveedorId,
    };
  }

  throw new Error("Formato no soportado. Usa Excel, CSV, PDF o una foto.");
}

/** Lines for an existing draft (its supplier is already known). */
export async function analizarFactura(
  compraId: string,
  fd: FormData,
): Promise<ActionResult<AnalisisFactura>> {
  return attempt("analizarFactura", async () => {
    await assertPermiso("abastecer");
    const { data: compra } = await insforgeAdmin.database
      .from("compras")
      .select("proveedor_id, estado")
      .eq("id", compraId)
      .maybeSingle();
    const c = compra as { proveedor_id: string; estado: string } | null;
    if (!c) throw new Error("Compra no encontrada");
    if (c.estado !== "borrador")
      throw new Error(`La compra ya fue ${c.estado}; sólo un borrador acepta líneas`);
    return (await leerArchivo(fd, async () => c.proveedor_id, null)).analisis;
  });
}

export type LecturaFactura = AnalisisFactura & {
  /** Matched by the issuer's name; null when no supplier on file matches. */
  proveedorId: string | null;
  /** The issuer as printed, to show when it matched nobody. */
  proveedorTexto: string | null;
  fecha: string | null; // yyyy-mm-dd
  diasCredito: number | null;
  total: number | null;
};

const sinAcentos = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** The supplier on file whose name appears in the issuer's ("OPTIMO" in "OPTIMO AUTOPARTES"). */
async function proveedorPorNombre(texto: string | undefined): Promise<string | null> {
  const t = sinAcentos(texto ?? "");
  if (t.length < 3) return null;
  const { data } = await insforgeAdmin.database.from("proveedores").select("id, nombre").eq("is_active", true);
  const hits = ((data ?? []) as { id: string; nombre: string }[])
    .map((p) => ({ id: p.id, n: sinAcentos(p.nombre) }))
    .filter((p) => p.n.length >= 3 && (` ${t} `.includes(` ${p.n} `) || ` ${p.n} `.includes(` ${t} `)))
    .sort((a, b) => b.n.length - a.n.length);
  return hits[0]?.id ?? null;
}

const fechaISO = (t: string | undefined) => (t && /^\d{4}-\d{2}-\d{2}$/.test(t.trim()) ? t.trim() : null);

/**
 * Read an invoice for a purchase that doesn't exist yet: the header (supplier,
 * folio, date, credit, total) and its lines, matched in the inventory the goods
 * go to. Writes nothing — the purchase is created only once someone reviewed it.
 */
export async function leerFacturaNueva(
  fd: FormData,
  inventarioId: string,
): Promise<ActionResult<LecturaFactura>> {
  return attempt("leerFacturaNueva", async () => {
    await assertPermiso("abastecer");
    const { analisis, factura, proveedorId } = await leerArchivo(
      fd,
      (f) => proveedorPorNombre(f?.proveedor),
      inventarioId || null,
    );
    const fecha = fechaISO(factura?.fecha_emision);
    const vence = fechaISO(factura?.fecha_vencimiento);
    const dias =
      factura?.dias_credito ??
      (fecha && vence ? Math.round((Date.parse(vence) - Date.parse(fecha)) / 86_400_000) : null);
    return {
      ...analisis,
      proveedorId,
      proveedorTexto: factura?.proveedor?.trim() || null,
      fecha,
      diasCredito: dias != null && dias > 0 && dias <= 365 ? dias : null,
      total: factura?.total != null && factura.total > 0 ? factura.total : null,
    };
  });
}

/** Store the document on the purchase. Separate from reading it: a shop may want
 *  the invoice on file even when the lines were typed by hand. */
export async function subirFactura(
  compraId: string,
  fd: FormData,
): Promise<ActionResult<{ url: string }>> {
  return attempt("subirFactura", async () => {
    await assertPermiso("abastecer");
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
  });
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
): Promise<ActionResult<{ agregadas: number; recordadas: number }>> {
  return attempt("aplicarLineas", async () => {
    await assertPermiso("abastecer");
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
  });
}
