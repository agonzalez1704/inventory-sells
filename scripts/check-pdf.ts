// node --experimental-strip-types scripts/check-pdf.ts [salida.pdf]
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { construirDemandaPdf } from "../lib/demanda-pdf.ts";

const filas = [
  { norm: "a", texto: "balata delantera versa", tipo: "otro", veces: 7, piezas: 9, ultima: "2026-09-29T19:30:00Z",
    product_id: null, producto: null, existencia: null, clientes: "Jairo, Marisol", esperando: 2, ids: ["1"] },
  { norm: "b", texto: "amortiguador", tipo: "otro", veces: 3, piezas: 3, ultima: "2026-09-28T16:00:00Z",
    product_id: "p1", producto: "AMORTIGUADOR DELANTERO IZQUIERDO NISSAN VERSA 2012-2019 MARCA LARGA", existencia: 0,
    clientes: null, esperando: 0, ids: ["2"] },
  { norm: "c", texto: "bujia", tipo: "otro", veces: 1, piezas: 2, ultima: "2026-09-27T15:00:00Z",
    product_id: "p2", producto: "BUJIA NGK", existencia: 4, clientes: "Brayan", esperando: 1, ids: ["3"] },
] as Parameters<typeof construirDemandaPdf>[0];

const doc = await construirDemandaPdf(filas, 30, "Refaccionaria Ruli");
const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
assert.ok(bytes.byteLength > 1500, "el PDF salió vacío");
assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), "%PDF-");
// Una sola página: la lista del comprador cabe en carta hasta que crezca.
assert.equal(doc.getNumberOfPages(), 1);
const salida = process.argv[2];
if (salida) writeFileSync(salida, bytes);
console.log("✓ pdf");
