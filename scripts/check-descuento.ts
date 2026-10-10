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

// Card terminal commission: 3.6% + IVA on $1,250.00 is $52.20; 2.4% + IVA on $1,000 is $27.84.
import { comisionEfectiva, comisionCents } from "../lib/terminales.ts";
assert.equal(comisionEfectiva({ comision_pct: 3.6, iva_comision: true }), 4.176);
assert.equal(comisionCents(125000, comisionEfectiva({ comision_pct: 3.6, iva_comision: true })), 5220);
assert.equal(comisionCents(100000, comisionEfectiva({ comision_pct: 2.4, iva_comision: true })), 2784);
assert.equal(comisionEfectiva({ comision_pct: 3.49, iva_comision: false }), 3.49);
console.log("✓ comisión de terminal");
