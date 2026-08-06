// The purchase-line template: one definition that both writes the file and
// reads it back.
//
// Why a template at all, when there is already a heuristic spreadsheet parser:
// a real restock sheet carries BOTH "Stock actual" and "Cantidad". A parser that
// guesses by keyword will, sooner or later, read the current stock as the
// incoming quantity and silently double the inventory — an error that throws
// nothing and is only found by counting shelves. So a recognised file is parsed
// by position and name, with no guessing at all, and anything unrecognised is
// routed to the heuristic parser and reported as such.
//
// Generation and parsing share COLUMNAS on purpose. Two copies of this list
// would drift the first time a column moved, and the file would still look
// right while importing into the wrong field.

const norm = (v: unknown): string =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const PLANTILLA_VERSION = "compra-v1";
export const PLANTILLA_HOJA = "Compra";

export type ColumnaClave =
  | "sku"
  | "producto"
  | "cantidad"
  | "costo"
  | "sku_proveedor"
  | "pedido";

// `alias` is a CLOSED list of other titles this column answers to — not keyword
// matching. It exists so sheets this app produced before the template was
// defined still load, and so a supplier who renames "Cantidad" to "Piezas"
// doesn't hit the heuristic path. Recognition still demands every required
// column, so a stray "Stock" column can never stand in for the quantity.
export const COLUMNAS: {
  clave: ColumnaClave;
  titulo: string;
  alias: string[];
  ancho: number;
  requerida: boolean;
  ayuda: string;
}[] = [
  { clave: "sku", titulo: "SKU", alias: ["clave", "codigo", "código"], ancho: 24, requerida: true,
    ayuda: "Tu clave de producto. Si no la sabes, deja el nombre y se busca." },
  { clave: "producto", titulo: "Producto", alias: ["descripcion", "descripción", "nombre"], ancho: 46, requerida: false,
    ayuda: "Sólo para que reconozcas la línea." },
  { clave: "cantidad", titulo: "Cantidad", alias: ["pedir", "piezas", "pzas", "cant"], ancho: 12, requerida: true,
    ayuda: "Piezas que ENTRAN al inventario." },
  { clave: "costo", titulo: "Costo unitario", alias: ["costo unit.", "costo unit", "costo"], ancho: 15, requerida: false,
    ayuda: "Lo que te cuesta cada pieza, en pesos. Sin IVA si tu factura lo separa." },
  { clave: "sku_proveedor", titulo: "Clave del proveedor", alias: ["clave proveedor", "sku proveedor"], ancho: 22, requerida: false,
    ayuda: "El código que usa tu proveedor. Se recuerda para la próxima factura." },
  { clave: "pedido", titulo: "Pedido", alias: ["solicitado", "requisicion", "requisición"], ancho: 12, requerida: false,
    ayuda: "Lo que habías pedido, si hubo requisición. Sirve para ver faltantes." },
];

/** Every title a column answers to, normalised. Canonical title first. */
const titulosDe = (c: (typeof COLUMNAS)[number]): string[] =>
  [c.titulo, ...c.alias].map(norm);

/** Header row exactly as written, in order. */
export const ENCABEZADOS = COLUMNAS.map((c) => c.titulo);

export type FilaPlantilla = {
  sku: string;
  producto: string;
  cantidad: number;
  costo: number | null;
  skuProveedor: string;
  pedido: number | null;
  /** 1-based row in the sheet, so a problem can be pointed at. */
  fila: number;
};

export type ResultadoPlantilla = {
  filas: FilaPlantilla[];
  /** Rows skipped and why — surfaced, never swallowed. */
  ignoradas: { fila: number; motivo: string }[];
};

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/**
 * Is this grid our template? Returns the header row index, or -1.
 *
 * Recognition is by the header row carrying every REQUIRED column title, not by
 * sheet name or a version cell alone — a user who renames the tab or copies the
 * rows into a new workbook still gets the deterministic path, which is what they
 * expect after downloading a template.
 */
export function filaEncabezado(grid: unknown[][]): number {
  const requeridas = COLUMNAS.filter((c) => c.requerida);
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    const celdas = (grid[r] ?? []).map(norm);
    if (requeridas.every((c) => titulosDe(c).some((t) => celdas.includes(t)))) return r;
  }
  return -1;
}

export function esPlantilla(grid: unknown[][]): boolean {
  return filaEncabezado(grid) >= 0;
}

/**
 * Read a recognised template.
 *
 * Data ends at the first row with no SKU and no product — which is what the
 * totals block at the bottom of a generated sheet looks like. Without that, rows
 * like "TOTAL FACTURA:" import as products; measured on a real file, five of
 * them did.
 */
export function leerPlantilla(grid: unknown[][]): ResultadoPlantilla {
  const hi = filaEncabezado(grid);
  const filas: FilaPlantilla[] = [];
  const ignoradas: { fila: number; motivo: string }[] = [];
  if (hi < 0) return { filas, ignoradas };

  // Map each column key to its actual position, so reordering columns in the
  // sheet doesn't misread the file.
  const cabecera = (grid[hi] ?? []).map(norm);
  const pos: Partial<Record<ColumnaClave, number>> = {};
  for (const c of COLUMNAS) {
    // Canonical title wins, so a sheet carrying both never binds to the alias.
    for (const t of titulosDe(c)) {
      const i = cabecera.indexOf(t);
      if (i >= 0) { pos[c.clave] = i; break; }
    }
  }

  const celda = (row: unknown[], k: ColumnaClave): unknown =>
    pos[k] === undefined ? "" : row[pos[k]!];

  for (let r = hi + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const sku = String(celda(row, "sku") ?? "").trim();
    const producto = String(celda(row, "producto") ?? "").trim();
    const nFila = r + 1;

    // Blank line, or a group heading that only labels a section.
    if (!sku && !producto) continue;
    // A totals row has text in the product column but never a SKU or a quantity.
    const cantidad = num(celda(row, "cantidad"));
    if (!sku) {
      if (cantidad == null) continue; // "TOTAL FACTURA:", subtotals, notes
      ignoradas.push({ fila: nFila, motivo: "sin SKU" });
      continue;
    }
    if (cantidad == null || cantidad <= 0) {
      ignoradas.push({ fila: nFila, motivo: "cantidad vacía o cero" });
      continue;
    }
    if (!Number.isInteger(cantidad)) {
      ignoradas.push({ fila: nFila, motivo: `cantidad no entera (${cantidad})` });
      continue;
    }

    const costo = num(celda(row, "costo"));
    const pedido = num(celda(row, "pedido"));
    filas.push({
      sku,
      producto,
      cantidad,
      costo: costo != null && costo >= 0 ? costo : null,
      skuProveedor: String(celda(row, "sku_proveedor") ?? "").trim(),
      pedido: pedido != null && pedido >= 0 ? Math.round(pedido) : null,
      fila: nFila,
    });
  }

  return { filas, ignoradas };
}
