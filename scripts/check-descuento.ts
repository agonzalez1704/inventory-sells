// node --experimental-strip-types scripts/check-descuento.ts
// Expected values are what Postgres returns for round(p * (100 - pct) / 100.0).
import assert from "node:assert/strict";
import { conDescuento } from "../lib/money.ts";

assert.equal(conDescuento(49000, 12.5), 42875);
assert.equal(conDescuento(18000, 10), 16200);
assert.equal(conDescuento(4999, 10), 4499); // 4499.1
assert.equal(conDescuento(5, 50), 3); // 2.5 rounds up, like PG
assert.equal(conDescuento(45000, 0), 45000);
assert.equal(conDescuento(45000, 100), 0);
console.log("✓ descuento");
