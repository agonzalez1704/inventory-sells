/**
 * Grouping decides what a card is. Two mistakes matter: merging models that are
 * not the same repair (a customer buys the wrong screen), and splitting one
 * model across cards (the comparison the grouping exists for disappears).
 *
 *   node --experimental-strip-types scripts/test-agrupar-modelo.ts
 */
import assert from "node:assert/strict";
import { agruparPorModelo, glosaDe } from "../lib/calidades.ts";

const fila = (id: string, name: string, modelo: string, calidad: string | null, precio: number, qty = 3, brand = "IPHONE", category = "pantallas") =>
  ({ id, name, modelo, brand, category, calidad, price_cents: precio, quantity: qty, image_url: null });

const g = agruparPorModelo([
  fila("a", "13 OLED", "13", "OLED", 81000),
  fila("b", "13 HD INCELL", "13", "Incell", 28000),
  fila("c", "13 ORG", "13", "Original", 208000),
  fila("d", "13 PRO MAX OLED", "13 PRO MAX", "OLED", 114000),
  // Mismo texto de modelo, otra categoría: una batería no es una pantalla.
  fila("e", "13 PRO", "13 PRO", null, 38000, 3, "IPHONE", "bateria"),
  fila("f", "13 PRO OLED", "13 PRO", "OLED", 95000),
]);

const por = (m: string, c = "pantallas") => g.find((x) => x.modelo === m && x.category === c);

assert.equal(por("13")!.variantes.length, 3, "las 3 calidades del 13 van en una tarjeta");
assert.equal(por("13")!.desde_cents, 28000, "el 'desde' es la más barata");
assert.deepEqual(
  por("13")!.variantes.map((v) => v.calidad),
  ["Incell", "OLED", "Original"],
  "de menor a mayor precio: la escalera se lee hacia arriba",
);
assert.equal(por("13 PRO MAX")!.variantes.length, 1, "un modelo distinto no se mezcla");
// La trampa: mismo modelo, distinta categoría.
assert.equal(por("13 PRO", "bateria")!.variantes.length, 1, "batería aparte");
assert.equal(por("13 PRO")!.variantes.length, 1, "pantalla aparte");

// La glosa sólo donde es defendible.
assert.equal(glosaDe("OLED"), "Calidad muy parecida a la original.");
assert.ok(!/parecida a la original/.test(glosaDe("Incell") ?? ""), "Incell no puede decirse parecida a la original");
assert.equal(glosaDe(null), null, "sin calidad, sin glosa inventada");

// El escaparate no publica inventario: sólo señales.
const v = por("13")!.variantes[0];
assert.equal(v.disponible, true);
assert.ok(!("existencia" in v), "una variante no debe cargar el conteo de stock");

console.log("✓ agrupa por modelo sin mezclar categorías, y la glosa no promete de más");
