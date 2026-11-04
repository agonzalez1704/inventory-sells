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

// Yoko's stock in GDL (stock 3 nov GDL): car in the name, A = cost, last column = stock.
const gdl = "/Users/antoniogonzalez/Downloads/stock 3 nov GDL (1).xlsx";
if (!process.argv[2] && (await import("node:fs")).existsSync(gdl)) {
  const b = readFileSync(gdl);
  const lista = await parseSpreadsheet({ arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } as File);
  const p = new Map(lista.map((r) => [r.sku, r]));
  console.log(`lista GDL: ${lista.length}`);
  assert.equal(lista.length, 9036);
  assert.deepEqual(p.get("AANA0100"), {
    sku: "AANA0100",
    name: "FILTRO DE AIRE (ACCENT 1.6L 18-22) (SEDAN/H-BACK) KIA RIO 1.6L 18-24",
    quantity: 100,
    cost: 29,
    price: 50.46,
  });
  assert.ok(lista.every((r) => !r.category && !r.brand), "LINEA y MARCA del carro no son categoría ni marca");
  console.log("✓ Yoko GDL: carro en el nombre, costo A, precio ×1.74");
}
