// node --experimental-strip-types --no-warnings scripts/check-cliente-schema.ts
import assert from "node:assert/strict";
import { customerInputSchema, entero, decimal, pesosACentavos, erroresPorCampo } from "../modules/customers/schema.ts";

assert.equal(pesosACentavos(""), null);
assert.equal(pesosACentavos("$10,000"), 1_000_000);
assert.equal(pesosACentavos("1,250.50"), 125_050);
assert.equal(pesosACentavos("1500,5"), 150_050);
assert.ok(Number.isNaN(pesosACentavos("abc")));
assert.equal(entero(" 15 "), 15);
assert.equal(entero(""), null);
assert.ok(Number.isNaN(entero("iouoijklnl")));
assert.equal(decimal("12,5"), 12.5);
assert.ok(Number.isNaN(decimal("x")));

const base = {
  nombre: "Taller", telefono: "4771234567", email: null, descuento_pct: 0, tipo: "publico",
  notas: null, credito_dias: null, credito_limite_cents: null,
};
assert.ok(customerInputSchema.safeParse(base).success);
assert.ok(customerInputSchema.safeParse({ ...base, ubicacion: "https://maps.app.goo.gl/abc" }).success);
assert.ok(customerInputSchema.safeParse({ ...base, ubicacion: "20.67, -103.35" }).success);

// The screenshot: garbage days, "r" as location — each named on its own field.
const r = customerInputSchema.safeParse({ ...base, credito_dias: entero("iouoijklnl"), ubicacion: "r", email: "no-es-correo" });
assert.ok(!r.success);
const e = erroresPorCampo(r.error);
assert.deepEqual(Object.keys(e).sort(), ["credito_dias", "email", "ubicacion"]);
assert.match(e.credito_dias, /1 a 365/);
assert.ok(!customerInputSchema.safeParse({ ...base, credito_dias: 400 }).success);
assert.ok(!customerInputSchema.safeParse({ ...base, telefono: "123" }).success);
assert.ok(!customerInputSchema.safeParse({ ...base, bloqueo_motivo: "x" }).success);
console.log("✓ esquema de cliente");
