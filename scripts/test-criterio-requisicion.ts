/**
 * The model's answer becomes a purchase order, so the mapping back onto real
 * products is the step worth proving. Every case here is something a language
 * model actually does: a row number out of range, a verdict on a line it was
 * told not to touch, the same row twice, a "group" of one.
 *
 *   node --experimental-strip-types scripts/test-criterio-requisicion.ts
 */
import assert from "node:assert/strict";
import { sanear, aplicarCriterio } from "../modules/requisiciones/criterio.ts";

const LINEAS = [
  { sku: "a05", nombre: "SAM A05", sugerido: 4, fuente: "ritmo" },      // 0 vende
  { sku: "xr", nombre: "XR INCELL", sugerido: 3, fuente: "ritmo" },     // 1 vende
  { sku: "6s", nombre: "6S AAA", sugerido: 0, fuente: "agotado" },      // 2 candidata
  { sku: "s24", nombre: "S24 OLED", sugerido: 0, fuente: "agotado" },   // 3 candidata
];
const CANDIDATAS = [2, 3];

// --- sanear: fails closed on anything that does not point at a real question
{
  const s = sanear(
    {
      candidatas: [
        { fila: 99, surtir: true, qty: 5, motivo: "fila inexistente" },
        { fila: -1, surtir: true, qty: 5, motivo: "negativa" },
        { fila: 0, surtir: true, qty: 9, motivo: "no era candidata" },
        { fila: 3, surtir: true, qty: 2, motivo: "modelo vigente" },
        { fila: 3, surtir: false, qty: 0, motivo: "repetida" },
      ],
      sustitutos: [{ filas: [1], motivo: "grupo de uno" }],
    },
    LINEAS.length,
    CANDIDATAS,
  );
  assert.deepEqual(
    s.candidatas.map((c) => c.fila),
    [3],
    "sólo sobrevive la fila candidata válida, y una sola vez",
  );
  assert.equal(s.sustitutos.length, 0, "un grupo de una fila no es un duplicado");
}

// --- aplicarCriterio: lines with a rate are never touched by the model
{
  const r = aplicarCriterio(LINEAS, {
    candidatas: [
      { fila: 2, surtir: false, qty: 0, motivo: "modelo descontinuado" },
      { fila: 3, surtir: true, qty: 2, motivo: "modelo vigente" },
    ],
    sustitutos: [{ filas: [0, 1], motivo: "mismo display" }],
  });

  assert.deepEqual(r.lineas.map((l) => l.sku), ["a05", "xr", "s24"], "la descartada sale");
  assert.deepEqual(r.lineas[0], LINEAS[0], "una línea con ritmo queda intacta");
  assert.equal(r.lineas[2].sugerido, 2, "la candidata aprobada toma la cantidad del modelo");
  assert.equal(r.lineas[2].fuente, "ia", "y queda marcada como criterio del modelo");
  assert.deepEqual(r.descartadas, [
    { sku: "6s", nombre: "6S AAA", motivo: "modelo descontinuado" },
  ]);
  // Reported, not merged: both stay on the list for the buyer to decide.
  assert.deepEqual(r.sustitutos, [{ skus: ["a05", "xr"], motivo: "mismo display" }]);
  assert.ok(
    r.lineas.some((l) => l.sku === "a05") && r.lineas.some((l) => l.sku === "xr"),
    "un grupo de sustitutos no borra ninguna de las dos",
  );
}

// --- surtir:true con qty 0 es un descarte, no una línea de cero piezas
{
  const r = aplicarCriterio(LINEAS, {
    candidatas: [{ fila: 2, surtir: true, qty: 0, motivo: "sí pero cero" }],
    sustitutos: [],
  });
  assert.ok(!r.lineas.some((l) => l.sku === "6s"), "no entra una línea de 0 piezas");
  assert.equal(r.descartadas.length, 1);
}

console.log("✓ el criterio del modelo sólo toca las filas que se le preguntaron");
