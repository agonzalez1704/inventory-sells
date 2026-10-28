// node --experimental-strip-types scripts/check-saberes.ts
// What the shop teaches the agent: synonyms, set pieces, sides, families.
import assert from "node:assert/strict";
import { aplicarSinonimos, dicePalabras, familiaDe, ladoDe, nombreCoincide } from "../lib/search.ts";

const sin = [
  { frases: ["cristal", "vidrio"], nombre: "glass" },
  { frases: ["pila"], nombre: "bateria" },
  { frases: ["tapa de atrás"], nombre: "tapa trasera" },
];
assert.equal(aplicarSinonimos("¿Cuánto el cristal del 11 Pro Max?", sin), "cuanto el glass del 11 pro max");
assert.equal(aplicarSinonimos("la tapa de atrás del 13", sin), "la tapa trasera del 13");
assert.equal(aplicarSinonimos("pilar de iphone", sin), null, "whole words only");
assert.equal(aplicarSinonimos("pantalla 12", sin), null);
console.log("✓ sinónimos");

assert.ok(dicePalabras("buenas, tienes la suspensión completa de un vento 2017", ["suspension completa"]));
assert.ok(!dicePalabras("suspensiones", ["suspension"]));
console.log("✓ frases de un juego");

assert.ok(nombreCoincide("Amortiguador Del. A1 11-18 Ibiza 10-17 T", "amortiguador del"));
assert.ok(!nombreCoincide("Amortiguador Tras. Toledo 13-19 Polo 18-", "amortiguador del"));
assert.ok(nombreCoincide("BASE DE AMORTIGUADOR TRAS", "base amortiguador tras"));
assert.ok(!nombreCoincide("BASE DE AMORTIGUADOR TRAS", "amortiguador tras"), "a base is not a shock");
assert.ok(nombreCoincide("JGO BALATAS DEL. TSURU", "balata del"));
assert.ok(nombreCoincide("ROTULA INF DER/IZQ VERSA 1.6L", "rótula inf"));
assert.ok(!nombreCoincide("cualquier cosa", ""));
console.log("✓ pieza contra nombre del catálogo");

assert.equal(ladoDe("HORQUILLA INF. IZQ. FRONTIER V6 21-23 NP"), "izq");
assert.equal(ladoDe("HORQUILLA INF. DER. KICKS 16-24"), "der");
assert.equal(ladoDe("ROTULA INF DER/IZQ AVEO 07-17"), "ambos");
assert.equal(ladoDe("Amortiguador Del. A1"), null);
console.log("✓ lado");

assert.deepEqual(familiaDe("Amortiguador Del. A1 11-18 Ibiza 10-17 T"), { busca: "amortiguador del", nombre: "Amortiguador delantero" });
assert.deepEqual(familiaDe("BASE DE AMORTIGUADOR TRAS"), { busca: "base amortiguador tras", nombre: "Base amortiguador trasero" });
assert.deepEqual(familiaDe("HORQUILLA INF. IZQ. FRONTIER"), { busca: "horquilla inf", nombre: "Horquilla inferior" });
assert.deepEqual(familiaDe("Vieleta Int. Polo 18-22 Vento 14-22"), { busca: "vieleta int", nombre: "Vieleta interior" });
console.log("✓ familia de una pieza");

// A part fits the customer's year only if one of its ranges covers it.
import { aniosEnNombre } from "../lib/search.ts";
assert.deepEqual(aniosEnNombre("CREM ELECTRO KICKS 17-20 (VERSA 20-22)"), [[2017, 2020], [2020, 2022]]);
assert.deepEqual(aniosEnNombre("CREM ELECTRO VERSA 12-19 V-DRIVE/NOTE 14-19, MARCH"), [[2012, 2019], [2014, 2019]]);
assert.deepEqual(aniosEnNombre("Amortiguador Tras. Toledo 13-19 Polo 18-", 2026), [[2013, 2019], [2018, 2027]]);
assert.deepEqual(aniosEnNombre("ROTULA INF DER HID POINTER 98-09"), [[1998, 2009]]);
assert.deepEqual(aniosEnNombre("CREM ELECTRO VERSA,MARCH 1.6 11-20"), [[2011, 2020]]);
assert.deepEqual(aniosEnNombre("CAJA DE DIRECCION HID"), []);
console.log("✓ años en el nombre");

// A typed model that is a typo of a known one.
import { quisoDecir } from "../lib/search.ts";
assert.equal(quisoDecir("Toledoo", ["Toledo", "Ibiza", "Leon"]), "Toledo");
assert.equal(quisoDecir("Toledo", ["Toledo", "Ibiza"]), null, "known as typed");
assert.equal(quisoDecir("Kicks", ["Versa", "March"]), null, "nothing close: new model");
assert.equal(quisoDecir("Volkwagen", ["Volkswagen", "Nissan"]), "Volkswagen");
console.log("✓ quiso decir");
