// node --experimental-strip-types scripts/check-qr.ts
import assert from "node:assert/strict";
import { enlaceProducto, idDeCodigo } from "../modules/inventory/qr.ts";

const id = "3f2b8c1e-9a4d-4e2f-8b1a-2c3d4e5f6a7b";
assert.equal(idDeCodigo(enlaceProducto("https://fiable.vercel.app", id)), id);
assert.equal(idDeCodigo(`https://x.com/inventario/${id}`), id);
assert.equal(idDeCodigo(`https://x.com/tienda/${id}`), null);
assert.equal(idDeCodigo("https://x.com/inventario?p=nope"), null);
assert.equal(idDeCodigo("A2655"), null);
console.log("✓ qr");
