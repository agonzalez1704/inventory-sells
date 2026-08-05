// Replay the refaccionaria's real ERP export through the spreadsheet parser.
// node --experimental-strip-types scripts/test-import-ruli.ts [archivo.xls]
//
// This file is the reason the parser grew `ultimo costo`, `precio 4`, `linea`
// and the description-continuation column: without them 21k products import at
// $0.00 and nothing complains.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { parseSpreadsheet } from "../modules/inventory/import/parse-spreadsheet.ts";

const ruta = process.argv[2] ?? "/Users/antoniogonzalez/Downloads/PRODUCTOS 05-08-26.xls";
const buf = readFileSync(ruta);
// parseSpreadsheet takes a browser File; give it the same shape.
const file = { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as File;

const filas = await parseSpreadsheet(file);
const con = (f: (r: (typeof filas)[number]) => unknown) => filas.filter(f).length;

console.log(`filas parseadas: ${filas.length}`);
console.log(`  con precio:    ${con((r) => r.price)}`);
console.log(`  con costo:     ${con((r) => r.cost)}`);
console.log(`  con categoría: ${con((r) => r.category)}`);
console.log(`  con atributos: ${con((r) => r.attributes?.length)}`);
console.log(`  con cantidad:  ${con((r) => r.quantity)}`);

const porSku = new Map(filas.map((r) => [r.sku, r]));
let fallos = 0;
const check = (nombre: string, fn: () => void) => {
  try { fn(); console.log(`✓ ${nombre}`); } catch (e) { fallos++; console.error(`✗ ${nombre}\n  ${(e as Error).message}`); }
};

// The row hand-verified against the spreadsheet.
check("DVNN0200 mapea todas las columnas", () => {
  const r = porSku.get("DVNN0200")!;
  assert.ok(r, "SKU no encontrado");
  assert.equal(r.cost, 228, "Último costo");
  assert.equal(r.price, 396.72, "PRECIO 4");
  assert.equal(r.category, "YSVAR", "Línea");
  assert.equal(r.quantity, 2, "Existencias");
  // Descripción + Continuacion, rejoined.
  assert.match(r.name!, /^VARILLA DIR CENTRAL D-21 2WD 02-07 2\.4L X-TERRA 2WD 98-04$/);
});

check("el precio nunca se pierde en silencio", () => {
  assert.ok(con((r) => r.price) > 6000, `solo ${con((r) => r.price)} con precio`);
});
check("ventas anuales NO se leyeron como existencia", () => {
  // 60-123 has 19,788 annual sales and zero stock. Reading the wrong column
  // would invent twenty thousand pieces of it.
  const r = porSku.get("60-123");
  assert.ok(r, "SKU no encontrado");
  assert.ok(!r!.quantity, `quantity=${r!.quantity}`);
});
check("clave alterna llega como atributo", () => {
  const r = porSku.get("RH5122")!;
  assert.equal(r.attributes?.find((a) => a.key === "clave_alterna")?.value, "DMNE0100.");
});
check("ninguna fila trae saltos de línea en el nombre", () => {
  const malas = filas.filter((r) => /[\r\n]/.test(r.name ?? ""));
  assert.equal(malas.length, 0, `${malas.length} con saltos`);
});

console.log(fallos === 0 ? "\nTodo en orden." : `\n${fallos} fallo(s).`);
process.exit(fallos ? 1 : 0);
