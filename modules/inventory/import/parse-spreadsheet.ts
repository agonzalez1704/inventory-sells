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
  | "name2"
  | "sku"
  | "skuAlt"
  | "brand"
  | "color"
  | "size"
  | "category"
  | "cost"
  | "price"
  | "quantity"
  | "ventas";

// Matching is exact (after accent/case normalisation), never by prefix. A fuzzy
// "starts with precio" rule would happily bind "precio costo" or "precio
// anterior" to the sale price, and importing the wrong price list is a money
// bug nobody notices until a ticket is compared by hand.
const ALIASES: Record<Field, string[]> = {
  name: ["modelo", "model", "nombre", "producto", "descripcion", "articulo"],
  // ERPs truncate the description and spill the rest into a second column.
  name2: ["continuacion de descripcion", "continuacion", "descripcion 2"],
  sku: ["sku", "codigo", "code", "clave"],
  // Cross-reference part number: how a counter clerk actually searches.
  skuAlt: ["clave alterna", "codigo alterno", "sku alterno"],
  brand: ["marca", "brand"],
  color: ["color"],
  size: ["talla", "size", "medida"],
  category: ["linea", "categoria", "familia"],
  cost: ["costo", "cost", "ultimo costo", "costo ultimo"],
  price: ["precio", "price", "pvp", "venta", "precio 4"],
  quantity: [
    "pz", "pza", "pzas", "pieza", "piezas", "cantidad",
    "existencia", "existencias", "stock", "qty", "cant",
    // Grob's stock file: Producto | Descripcion | EnStock.
    "enstock", "en stock",
  ],
  // Not stock — kept so "cantidad de ventas anuales" can never be mistaken for
  // it, and because it tells you which products deserve a price first.
  ventas: ["cantidad de ventas anuales", "ventas anuales"],
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

  // `Producto | Descripcion` with no code column: "Producto" is the code (the
  // supplier's ERP calls its part number that), the description is the name.
  // Read as two names, the sheet looked pivoted and every product came out
  // twice — once named by its code, once with its description slugged as SKU.
  const hdr = grid[headerIdx] ?? [];
  if (!Object.values(headerMap).includes("sku")) {
    const n = (c: number) => norm(hdr[c]);
    const nombres = Object.keys(headerMap).map(Number).filter((c) => headerMap[c] === "name");
    const codigo = nombres.find((c) => ["producto", "articulo"].includes(n(c)));
    if (codigo !== undefined && nombres.some((c) => c !== codigo && n(c).startsWith("descripcion")))
      headerMap[codigo] = "sku";
  }

  const cols = Object.keys(headerMap).map(Number);
  // The tab name is a category only for sheets that don't carry one. When the
  // sheet HAS a category column, a blank cell means "uncategorised" — not "use
  // the tab name", which on an ERP export would file 1,790 parts under
  // "productos 05-08-26".
  const tieneColCategoria = cols.some((c) => headerMap[c] === "category");
  // An untitled tab ("Hoja1", "Sheet1") names nothing.
  const hojaGenerica = /^(hoja|sheet)\s*\d*$/.test(norm(sheetName));
  const categoriaHoja = tieneColCategoria || hojaGenerica ? undefined : norm(sheetName) || undefined;
  const nameCols = cols.filter((c) => headerMap[c] === "name").sort((a, b) => a - b);
  const skuCols = cols.filter((c) => headerMap[c] === "sku").sort((a, b) => a - b);
  const anchors = nameCols.length ? nameCols : skuCols;
  if (anchors.length === 0) return [];

  const multiGroup = anchors.length > 1;
  const brandRow = headerIdx > 0 ? (grid[headerIdx - 1] ?? []) : [];
  const width = (grid[headerIdx] ?? []).length;

  const out: ExtractedRow[] = [];
  for (let gi = 0; gi < anchors.length; gi++) {
    // A group runs from its anchor to the next one, which means columns to the
    // LEFT of the first anchor fall outside every group. That is fine for a
    // pivoted sheet (the groups tile the whole row) but wrong for an ordinary
    // one: ERPs put the code first, so `Clave | Descripción | …` silently lost
    // its SKU column and every product got a slug of its name instead — which
    // then merged distinct products that happened to share a description.
    const start = multiGroup ? anchors[gi] : 0;
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
      // Grob lists retired codes as "Producto Obsoleto" (one even turned into
      // a date by Excel): not a part anyone can sell.
      if (g.name !== undefined && norm(row[g.name]) === "producto obsoleto") continue;

      const color = g.color !== undefined ? str(row[g.color]) : undefined;
      const size = g.size !== undefined ? str(row[g.size]) : undefined;
      const qty = g.quantity !== undefined ? num(row[g.quantity]) : undefined;
      const price = g.price !== undefined ? num(row[g.price]) : undefined;
      const cost = g.cost !== undefined ? num(row[g.cost]) : undefined;
      const skuRaw = g.sku !== undefined ? str(row[g.sku]) : undefined;
      const cont = g.name2 !== undefined ? str(row[g.name2]) : undefined;
      const skuAlt = g.skuAlt !== undefined ? str(row[g.skuAlt]) : undefined;
      const ventas = g.ventas !== undefined ? num(row[g.ventas]) : undefined;
      const categoria =
        (g.category !== undefined ? str(row[g.category]) : undefined) ?? categoriaHoja;

      // Rejoin the description the ERP split, and flatten the line breaks some
      // of them carry inside a single cell.
      const nombre = [nameVal, cont].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

      const row2: ExtractedRow = {
        sku: skuRaw ?? slug([brand, nameVal, color].filter(Boolean).join("-")),
        name: nombre,
      };
      // The sheet's own MARCA column wins; the label above a pivoted group is
      // the fallback. The column was mapped but never read.
      const marca = (g.brand !== undefined ? str(row[g.brand]) : undefined) ?? brand;
      if (marca) row2.brand = marca;
      if (categoria) row2.category = categoria;
      if (color) row2.color = color;
      if (size) row2.size = size;
      if (qty != null) row2.quantity = Math.round(qty);
      if (price != null) row2.price = price;
      if (cost != null) row2.cost = cost;
      const attrs = [
        ...(skuAlt ? [{ key: "clave_alterna", value: skuAlt }] : []),
        ...(ventas ? [{ key: "ventas_anuales", value: String(Math.round(ventas)) }] : []),
      ];
      if (attrs.length) row2.attributes = attrs;
      if (row2.sku) out.push(row2);
    }
  }
  return out;
}

/**
 * Yoko's stock in Guadalajara, priced as of today: LINEA | CODIGO | MARCA | MODELO |
 * DESCRIPCION | AÑO | AÑOFIN | A | B | C | <almacén>. MARCA/MODELO/AÑO are the
 * CAR, not the part, so they go into the name (that's how the counter
 * searches); A/B/C are cost tiers and A is what Ruli pays (it matches the cost
 * of 785 of 2,469 shared parts exactly, median ratio 1.00); the column after C
 * is the warehouse's stock, 100 meaning "100 or more". LINEA (MEC/COL/ACC)
 * would only spawn junk categories.
 */
function rowsExistenciaYoko(grid: unknown[][]): ExtractedRow[] | null {
  const h = (grid[0] ?? []).map(norm);
  const col = (n: string) => h.indexOf(n);
  const [cod, marca, modelo, desc, de, a, c] = ["codigo", "marca", "modelo", "descripcion", "ano", "a", "c"].map(col);
  const hasta = col("anofin");
  if ([cod, desc, de, hasta, a, c].some((i) => i < 0) || col("b") < 0) return null;
  const almacen = c + 1;
  const yy = (v: unknown) => String(v ?? "").trim().slice(-2);

  const out: ExtractedRow[] = [];
  for (const row of grid.slice(1)) {
    const sku = str(row[cod]);
    const nombre = str(row[desc]);
    if (!sku || !nombre) continue;
    const anos = str(row[de]) ? `${yy(row[de])}-${yy(row[hasta])}` : "";
    const costo = num(row[a]);
    const r: ExtractedRow = {
      sku,
      name: [nombre, str(row[marca]), str(row[modelo]), anos].filter(Boolean).join(" ").replace(/\s+/g, " "),
      quantity: Math.max(0, Math.round(num(row[almacen]) ?? 0)),
    };
    if (costo) {
      r.cost = costo;
      // Ruli's own rule, read off its catalog: cost × 1.5 plus IVA (median
      // price/cost 1.74 over the shared parts). Only a fallback: a part Ruli
      // already stocks sells at its own price.
      // ponytail: the owner wants Yoko-only parts a bit higher (parcel to
      // GDL); a factor per supplier like Grob's once he names it.
      r.price = Math.round(costo * 1.5 * 1.16 * 100) / 100;
    }
    out.push(r);
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
    all.push(...(rowsExistenciaYoko(grid) ?? rowsFromGrid(grid, sheetName)));
  }
  return mergeBySku(all).filter((r) => r.sku !== "");
}
