// node --experimental-strip-types scripts/check-excel-catalogo.ts
import assert from "node:assert/strict";
import { compararCatalogo, leerHoja, type FilaActual } from "../modules/catalogo/excel-diff.ts";

const familias = [
  { id: "amortiguador", nombre: "Amortiguador", sistema: "suspension" },
  { id: "horquilla", nombre: "Horquilla", sistema: "suspension" },
];
const sistemas = [{ id: "suspension", nombre: "Suspensión" }, { id: "direccion", nombre: "Dirección" }];
const fila = (o: Partial<FilaActual> & { sku: string }): FilaActual => ({ name: "X", brand: null, familia: null, sistema: null, ...o });
const actual = new Map([
  ["SAN1", fila({ sku: "SAN1", name: "AMORT DEL", brand: "YOKO", familia: "amortiguador" })],
  ["SHN1", fila({ sku: "SHN1", name: "HORQ" })],
]);

// Untouched round trip: the file shows the inherited sistema, nothing changes.
let d = compararCatalogo([{ sku: "SAN1", nombre: "AMORT DEL", marca: "yoko", refaccion: "amortiguador", sistema: "Suspension" }], actual, familias, sistemas);
assert.deepEqual(d.conteo, { nombres: 0, marca: 0, refaccion: 0, sistema: 0 });

// Empty cells never clear.
d = compararCatalogo([{ sku: "SAN1" }], actual, familias, sistemas);
assert.equal(d.grupos.length + d.nombres.length, 0);

// Changes group by value; unknown names and SKUs are reported, not applied.
d = compararCatalogo(
  [{ sku: "SHN1", nombre: "HORQUILLA INF", refaccion: "Horquilla", sistema: "Dirección" }, { sku: "SAN1", refaccion: "Amortiguadro" }, { sku: "NADA" }],
  actual, familias, sistemas,
);
assert.deepEqual(d.nombres, [{ sku: "SHN1", name: "HORQUILLA INF" }]);
assert.deepEqual(d.grupos.map((g) => [g.campo, g.valor, g.skus]), [["familia", "horquilla", ["SHN1"]], ["sistema", "direccion", ["SHN1"]]]);
assert.deepEqual(d.desconocidas, ["Amortiguadro"]);
assert.deepEqual(d.noEncontrados, ["NADA"]);

// Headers are found with accents and over a title row; no sku column = null.
assert.deepEqual(leerHoja([["Catálogo"], ["SKU", "Nombre", "Refacción"], ["A1", " b  c ", ""]]), [{ sku: "A1", nombre: "b c", marca: undefined, refaccion: undefined, sistema: undefined }]);
assert.equal(leerHoja([["nombre"], ["x"]]), null);
console.log("✓ excel del catálogo");
