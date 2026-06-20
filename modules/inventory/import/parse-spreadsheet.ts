import * as XLSX from "xlsx";
import type { ExtractedRow } from "./schema";

// Normalize a header: lowercase, trim, strip accents.
function norm(s: unknown): string {
  return String(s)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip combining diacritics
}

type ScalarField =
  | "sku"
  | "name"
  | "brand"
  | "size"
  | "color"
  | "category"
  | "cost"
  | "price"
  | "quantity";

const ALIASES: Record<ScalarField, string[]> = {
  sku: ["sku", "codigo", "code", "clave", "id"],
  name: ["name", "nombre", "descripcion", "producto", "modelo", "articulo"],
  brand: ["brand", "marca"],
  size: ["size", "talla", "medida"],
  color: ["color"],
  category: ["category", "categoria", "tipo", "linea"],
  cost: ["cost", "costo"],
  price: ["price", "precio", "pvp", "venta"],
  quantity: ["quantity", "cantidad", "existencia", "existencias", "stock", "qty", "piezas", "cant"],
};

// Headers consumed by known fields; everything else becomes an attribute.
const KNOWN = new Set<string>(Object.values(ALIASES).flat());

function parseNumber(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n =
    typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function slug(s: string): string {
  return norm(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Parse an Excel/CSV file in the browser into pre-commit rows. Unknown columns
// are preserved as type-specific attributes (category-agnostic catalog).
export async function parseSpreadsheet(file: File): Promise<ExtractedRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });

  return json
    .map((raw): ExtractedRow => {
      const byKey: Record<string, unknown> = {};
      const origByNorm: Record<string, string> = {};
      for (const k of Object.keys(raw)) {
        const n = norm(k);
        byKey[n] = raw[k];
        origByNorm[n] = String(k).trim();
      }

      const pick = (field: ScalarField): unknown => {
        for (const alias of ALIASES[field]) {
          if (alias in byKey && byKey[alias] !== "") return byKey[alias];
        }
        return undefined;
      };
      const str = (v: unknown) =>
        v != null && String(v).trim() !== "" ? String(v).trim() : undefined;

      const nameRaw = str(pick("name"));
      const skuRaw = str(pick("sku"));
      const sku = skuRaw ?? (nameRaw ? slug(nameRaw) : "");

      const row: ExtractedRow = { sku };
      if (nameRaw) row.name = nameRaw;
      const brand = str(pick("brand"));
      const size = str(pick("size"));
      const color = str(pick("color"));
      const category = str(pick("category"));
      if (brand) row.brand = brand;
      if (size) row.size = size;
      if (color) row.color = color;
      if (category) row.category = category;

      const cost = parseNumber(pick("cost"));
      const price = parseNumber(pick("price"));
      const quantity = parseNumber(pick("quantity"));
      if (cost != null) row.cost = cost;
      if (price != null) row.price = price;
      if (quantity != null) row.quantity = Math.round(quantity);

      // Any column we didn't recognize → an attribute (original header as key).
      const attrs: { key: string; value: string }[] = [];
      for (const n of Object.keys(byKey)) {
        if (KNOWN.has(n)) continue;
        const v = byKey[n];
        if (v == null || String(v).trim() === "") continue;
        attrs.push({ key: origByNorm[n] ?? n, value: String(v).trim() });
      }
      if (attrs.length > 0) row.attributes = attrs;

      return row;
    })
    .filter((r) => r.sku !== "");
}
