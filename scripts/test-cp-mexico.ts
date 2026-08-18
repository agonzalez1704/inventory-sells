/**
 * The postal code lookup feeds a shipping quote and two form fields, so a bad
 * state name is a wrong address on a real parcel. The mapping that matters most
 * is Mexico City: the API answers "Distrito Federal", the checkout's list says
 * "Ciudad de Mexico", and unmapped it fails silently for the largest market.
 *
 *   node --experimental-strip-types scripts/test-cp-mexico.ts
 */
import assert from "node:assert/strict";

const CASOS = [
  { cp: "06600", estadoEsperado: "Ciudad de Mexico" },
  { cp: "64000", estadoEsperado: "Nuevo Leon" },
  { cp: "37000", estadoEsperado: "Guanajuato" },
];

const ALIAS: Record<string, string> = {
  "distrito federal": "Ciudad de Mexico",
  "mexico": "Estado de Mexico",
};
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// La lista que el checkout ofrece en el select.
const ESTADOS = ["Aguascalientes","Baja California","Baja California Sur","Campeche","Chiapas","Chihuahua",
  "Ciudad de Mexico","Coahuila","Colima","Durango","Estado de Mexico","Guanajuato","Guerrero","Hidalgo",
  "Jalisco","Michoacan","Morelos","Nayarit","Nuevo Leon","Oaxaca","Puebla","Queretaro","Quintana Roo",
  "San Luis Potosi","Sinaloa","Sonora","Tabasco","Tamaulipas","Tlaxcala","Veracruz","Yucatan","Zacatecas"];

for (const { cp, estadoEsperado } of CASOS) {
  const r = await fetch(`https://api.zippopotam.us/mx/${cp}`);
  assert.ok(r.ok, `${cp}: la API respondió ${r.status}`);
  const j = (await r.json()) as { places: { state: string; "place name": string }[] };
  const crudo = sinAcentos(j.places[0].state);
  const estado = ALIAS[crudo.toLowerCase()] ?? crudo;

  assert.equal(estado, estadoEsperado, `${cp} debe resolver a ${estadoEsperado}`);
  // Lo que de verdad importa: que el valor exista en el select, o el campo
  // queda vacío y Skydropx no cotiza.
  assert.ok(ESTADOS.includes(estado), `${cp}: "${estado}" no está en la lista del checkout`);
  assert.ok(j.places[0]["place name"].length > 0, `${cp}: sin colonia para llenar municipio`);
}

console.log("✓ el CP resuelve a un estado que el checkout sí acepta, CDMX incluida");
