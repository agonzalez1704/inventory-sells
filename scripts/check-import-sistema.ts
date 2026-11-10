// node --experimental-strip-types scripts/check-import-sistema.ts
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { parseSpreadsheet } from "../modules/inventory/import/parse-spreadsheet.ts";

function archivo(filas: unknown[][]): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), "Hoja1");
  const buf: ArrayBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return { arrayBuffer: async () => buf } as File;
}

// Guadalajara's colisión file: Sistema | SKU | PRODUCTO | COSTO | PRECIO | STOCK.
const con = await parseSpreadsheet(archivo([
  ["Sistema", "SKU", "PRODUCTO", "COSTO", "PRECIO", "STOCK"],
  ["Colisión", "CPGN0170", "PARRILLA NEGRA", 180, 261, 100],
  ["", "CPGN0171", "PARRILLA CROMO", 190, 270, 5],
]));
assert.equal(con[0].sistema, "colision", "accent and case are normalised");
assert.equal(con[1].sistema, undefined, "a blank cell classifies nothing");
assert.equal(con[0].quantity, 100);

// The Mecánica file has no Sistema column.
const sin = await parseSpreadsheet(archivo([["SKU", "PRODUCTO", "STOCK"], ["AANA0100", "FILTRO DE AIRE", 100]]));
assert.equal(sin[0].sistema, undefined);
console.log("✓ columna sistema");
