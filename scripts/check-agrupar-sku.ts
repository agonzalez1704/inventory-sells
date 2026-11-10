import assert from "node:assert/strict";
import { agruparPorSku, siguienteFila } from "../modules/sales/agrupar.ts";

const orden = (id: string) => ({ mostrador: 0, cedis: 1, gdl: 2 })[id] ?? 999;
const vendible = (p: { inventory_id?: string }) => p.inventory_id !== "ajena";
const rows = [
  { id: "g", sku: "DMNN0900", quantity: 99, inventory_id: "gdl" },
  { id: "x", sku: "OTRA", quantity: 1, inventory_id: "mostrador" },
  { id: "m", sku: "dmnn0900 ", quantity: 17, inventory_id: "mostrador" },
  { id: "c0", sku: "9309004", quantity: 0, inventory_id: "mostrador" },
  { id: "c1", sku: "9309004", quantity: 55, inventory_id: "cedis" },
];
const g = agruparPorSku(rows, vendible, orden);
assert.deepEqual(g.map((f) => f.map((r) => r.id)), [["m", "g"], ["x"], ["c1", "c0"]]);
assert.equal(siguienteFila(g[0], {}, vendible).id, "m");
assert.equal(siguienteFila(g[0], { m: 17 }, vendible).id, "g");
assert.equal(siguienteFila(g[2], {}, vendible).id, "c1");
console.log("ok agrupar-sku");
