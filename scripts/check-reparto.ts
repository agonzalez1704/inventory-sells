import assert from "node:assert/strict";
import { repartir, entregaTexto, type Almacen } from "../modules/agent/reparto.ts";

const a = (almacen: string, existencia: number, precio_mxn: number, entrega_dias: number | null): Almacen => ({
  product_id: almacen, nombre: "BOMBA", almacen, existencia, precio_mxn, entrega_dias, imagen: null,
});
const mostrador = a("Mostrador", 1, 2200, 0);
const gdl = a("GUADALAJARA", 100, 2450, 3);

// 1 fits the counter: one line, nothing to confirm.
assert.deepEqual(repartir([mostrador, gdl], 1).lineas.map((l) => [l.almacen, l.qty]), [["Mostrador", 1]]);
// 4 wanted, 1 here: 1 here + 3 from Guadalajara at its own price.
const r = repartir([mostrador, gdl], 4);
assert.deepEqual(r.lineas.map((l) => [l.almacen, l.qty, l.precio_mxn]), [["Mostrador", 1, 2200], ["GUADALAJARA", 3, 2450]]);
assert.equal(r.falta, 0);
// More than all stock: what there is, and how many are missing.
const solo = repartir([mostrador], 4);
assert.deepEqual([solo.lineas.length, solo.lineas[0].qty, solo.falta], [1, 1, 3]);
// Unpriced or empty almacenes never serve.
assert.equal(repartir([a("X", 5, 0, 0), a("Y", 0, 10, 0)], 2).lineas.length, 0);
assert.equal(entregaTexto(0), "en tienda, inmediata");
assert.equal(entregaTexto(3), "llega en 3 días hábiles");
assert.equal(entregaTexto(null), "tiempo de entrega por confirmar");
console.log("check-reparto ok");
