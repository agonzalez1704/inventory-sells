// Replay Grob's stock file (the supplier warehouse) through the spreadsheet parser.
// node --experimental-strip-types scripts/test-import-grob.ts [archivo.xlsx]
//
// Producto | Descripcion | EnStock: two "name" headers made it look pivoted, so
// 16k parts came out as 20,886 rows named by their code, with no stock and
// "hoja1" as category.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSpreadsheet } from "../modules/inventory/import/parse-spreadsheet.ts";

const ruta = process.argv[2] ?? "/Users/antoniogonzalez/Downloads/Grob - requirements/INV 03 NOVIEMBRE 2026.xlsx";
const buf = readFileSync(ruta);
const file = { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as File;

const filas = await parseSpreadsheet(file);
const porSku = new Map(filas.map((r) => [r.sku, r]));
console.log(`filas parseadas: ${filas.length}`);

assert.equal(filas.length, 16065, "una fila por código, sin la obsoleta");
assert.deepEqual(porSku.get("1909058"), { sku: "1909058", name: "Amortiguador Del. Der.", quantity: 11 });
assert.ok(porSku.get("GP298"), "códigos con letras");
assert.ok(filas.every((r) => r.quantity != null), "EnStock es la existencia");
assert.ok(filas.every((r) => !r.category), "Hoja1 no es categoría");
assert.ok(!filas.some((r) => /obsoleto/i.test(r.name)), "sin Producto Obsoleto");
console.log("✓ Grob: código, descripción y existencia");
