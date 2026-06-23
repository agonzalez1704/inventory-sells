import * as XLSX from "xlsx";
import type { ExtractedRow } from "./schema";

// Parses real-world inventory spreadsheets in the browser:
//  - every tab/sheet (skipping Numbers "Export Summary"), tab name → category
//  - the header row is detected (it isn't always row 0)
//  - wide "pivoted" layouts are un-pivoted: a brand row above repeated
//    MODELO/COLOR/PZ column groups becomes one product per cell
//  - simple MODELO/PZ (or sku/nombre/precio…) sheets still work

type Field =
  | "name"
  | "sku"
  | "brand"
  | "color"
  | "size"
  | "cost"
  | "price"
  | "quantity";

const ALIASES: Record<Field, string[]> = {
  name: ["modelo", "model", "nombre", "producto", "descripcion", "articulo"],
  sku: ["sku", "codigo", "code", "clave"],
  brand: ["marca", "brand"],
  color: ["color"],
  size: ["talla", "size", "medida"],
  cost: ["costo", "cost"],
  price: ["precio", "price", "pvp", "venta"],
  quantity: [
    "pz", "pza", "pzas", "pieza", "piezas", "cantidad",
    "existencia", "existencias", "stock", "qty", "cant",
  ],
};

function norm(s: unknown): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip combining diacritics
}

function str(v: unknown): string | undefined {
  return v != null && String(v).trim() !== "" ? String(v).trim() : undefined;
}

function num(v: unknown): number | undefined {
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

function fieldOf(cell: unknown): Field | null {
  const n = norm(cell);
  if (!n) return null;
  for (const key of Object.keys(ALIASES) as Field[]) {
    if (ALIASES[key].includes(n)) return key;
  }
  return null;
}

function rowsFromGrid(grid: unknown[][], sheetName: string): ExtractedRow[] {
  // Find the header row: the one with the most recognizable field labels.
  let headerIdx = -1;
  let best = 0;
  let headerMap: Record<number, Field> = {};
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const map: Record<number, Field> = {};
    let score = 0;
    (grid[r] ?? []).forEach((cell, c) => {
      const f = fieldOf(cell);
      if (f) {
        map[c] = f;
        score++;
      }
    });
    if (score > best) {
      best = score;
      headerIdx = r;
      headerMap = map;
    }
  }
  if (headerIdx < 0 || best === 0) return [];

  const category = norm(sheetName) || undefined;
  const cols = Object.keys(headerMap).map(Number);
  const nameCols = cols.filter((c) => headerMap[c] === "name").sort((a, b) => a - b);
  const skuCols = cols.filter((c) => headerMap[c] === "sku").sort((a, b) => a - b);
  const anchors = nameCols.length ? nameCols : skuCols;
  if (anchors.length === 0) return [];

  const multiGroup = anchors.length > 1;
  const brandRow = headerIdx > 0 ? (grid[headerIdx - 1] ?? []) : [];
  const width = (grid[headerIdx] ?? []).length;

  const out: ExtractedRow[] = [];
  for (let gi = 0; gi < anchors.length; gi++) {
    const start = anchors[gi];
    const end = gi + 1 < anchors.length ? anchors[gi + 1] : width;

    // Map fields within this column group.
    const g: Partial<Record<Field, number>> = {};
    for (let c = start; c < end; c++) {
      const f = headerMap[c];
      if (f && g[f] === undefined) g[f] = c;
    }
    // A brand label above the group only makes sense in a multi-group (pivoted)
    // sheet; in single-group sheets the row above is a title, not a brand.
    const brand = multiGroup ? str(brandRow[start]) : undefined;
    const nameCol = g.name ?? g.sku;
    if (nameCol === undefined) continue;

    for (let r = headerIdx + 1; r < grid.length; r++) {
      const row = grid[r] ?? [];
      const nameVal = str(row[nameCol]);
      if (!nameVal) continue;

      const color = g.color !== undefined ? str(row[g.color]) : undefined;
      const size = g.size !== undefined ? str(row[g.size]) : undefined;
      const qty = g.quantity !== undefined ? num(row[g.quantity]) : undefined;
      const price = g.price !== undefined ? num(row[g.price]) : undefined;
      const cost = g.cost !== undefined ? num(row[g.cost]) : undefined;
      const skuRaw = g.sku !== undefined ? str(row[g.sku]) : undefined;

      const row2: ExtractedRow = {
        sku: skuRaw ?? slug([brand, nameVal, color].filter(Boolean).join("-")),
        name: nameVal,
      };
      if (brand) row2.brand = brand;
      if (category) row2.category = category;
      if (color) row2.color = color;
      if (size) row2.size = size;
      if (qty != null) row2.quantity = Math.round(qty);
      if (price != null) row2.price = price;
      if (cost != null) row2.cost = cost;
      if (row2.sku) out.push(row2);
    }
  }
  return out;
}

// Merge rows that resolve to the same SKU (same brand+model+color): sum
// quantities so a duplicate doesn't overwrite an earlier one.
function mergeBySku(rows: ExtractedRow[]): ExtractedRow[] {
  const map = new Map<string, ExtractedRow>();
  for (const r of rows) {
    const existing = map.get(r.sku);
    if (existing) {
      existing.quantity = (existing.quantity ?? 0) + (r.quantity ?? 0);
    } else {
      map.set(r.sku, { ...r });
    }
  }
  return [...map.values()];
}

export async function parseSpreadsheet(file: File): Promise<ExtractedRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  const all: ExtractedRow[] = [];
  for (const sheetName of wb.SheetNames) {
    if (/summary|resumen/.test(norm(sheetName))) continue; // Numbers export tab
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
    });
    all.push(...rowsFromGrid(grid, sheetName));
  }
  return mergeBySku(all).filter((r) => r.sku !== "");
}
