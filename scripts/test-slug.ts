// One slug definition feeds both the form's preview and the import's write.
// These cases pin the behaviours the catalog depends on: accents, symbols,
// and the exact strings already in production skus.
//   node --experimental-strip-types scripts/test-slug.ts
import assert from "node:assert/strict";
import { slugify } from "../lib/slug.ts";

assert.equal(slugify("BAT IPH 13 (2do) # A2655 - COBALTO PURO"), "bat-iph-13-2do-a2655-cobalto-puro");
assert.equal(slugify("Batería Ñandú  ÁÉÍ"), "bateria-nandu-aei", "acentos y eñes se aplanan");
assert.equal(slugify("12 / 12 PRO OLED"), "12-12-pro-oled");
assert.equal(slugify("  --raro--  "), "raro", "sin guiones en los bordes");
assert.equal(slugify(""), "");
console.log("✓ slugify estable: lo que el form muestra es lo que el import escribe");
