// The template parser, against the shapes that actually reach it.
// node --experimental-strip-types scripts/test-plantilla-compra.ts
//
// The case that matters is the totals block. A real restock sheet ends in
// "Subtotal …", "TOTAL FACTURA:" and a footnote; the heuristic parser turned
// five of those into products on the measured file. And "Stock actual" sitting
// next to "Cantidad" is the reason this parser exists at all — reading the wrong
// one doubles the inventory without raising anything.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import {
  ENCABEZADOS,
  PLANTILLA_HOJA,
  esPlantilla,
  leerPlantilla,
} from "../lib/plantilla-compra.ts";

let fallos = 0;
const check = (nombre: string, fn: () => void) => {
  try {
    fn();
    console.log(`✓ ${nombre}`);
  } catch (e) {
    fallos++;
    console.error(`✗ ${nombre}\n  ${(e as Error).message}`);
  }
};

// A generated sheet: title block, header, two group headings, data, totals.
const hoja: unknown[][] = [
  ["Lista de resurtido", "", "", "", "", ""],
  ["Pana's Batteries — 5 de agosto de 2026", "", "", "", "", ""],
  [],
  ENCABEZADOS,
  ["Pana's Batteries", "", "", "", "", ""], // group heading
  ["A2655", "BAT IPH 13", 8, 169, "PB-13", 8],
  ["A2636", "BAT IPH 13 PRO", 5, 205, "", 5],
  ["iphone-11-jk", "iPhone 11 JK", 5, 245, "", 10], // arrived short of the order
  [],
  ["", "Total a pedir", "", "", "", ""],
  ["", "Subtotal Pana's Batteries:", "", "", "", ""],
  ["", "TOTAL FACTURA:", "", "", "", ""],
  ["", "Costos unitarios tomados de fiable", "", "", "", ""],
];

check("reconoce su propia plantilla", () => {
  assert.equal(esPlantilla(hoja), true);
});

check("lee sólo las líneas de producto", () => {
  const { filas } = leerPlantilla(hoja);
  assert.equal(filas.length, 3, `leyó ${filas.length}: ${filas.map((f) => f.sku).join(", ")}`);
  assert.deepEqual(filas.map((f) => f.sku), ["A2655", "A2636", "iphone-11-jk"]);
});

check("el bloque de totales no se cuela como producto", () => {
  const { filas } = leerPlantilla(hoja);
  const basura = filas.filter((f) => /total|subtotal|costos unitarios/i.test(f.producto));
  assert.equal(basura.length, 0, `entró basura: ${basura.map((f) => f.producto).join(" | ")}`);
});

check("cantidad, costo y clave del proveedor", () => {
  const f = leerPlantilla(hoja).filas[0];
  assert.equal(f.cantidad, 8);
  assert.equal(f.costo, 169);
  assert.equal(f.skuProveedor, "PB-13");
});

check("pedido se conserva aparte de lo recibido", () => {
  const f = leerPlantilla(hoja).filas[2];
  assert.equal(f.cantidad, 5, "recibido");
  assert.equal(f.pedido, 10, "pedido");
});

check("columnas reordenadas se leen por nombre, no por posición", () => {
  const alReves = [ [...ENCABEZADOS].reverse(), ["", "", 245, 5, "iPhone 11 JK", "iphone-11-jk"] ];
  const { filas } = leerPlantilla(alReves);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].sku, "iphone-11-jk");
  assert.equal(filas[0].cantidad, 5);
  assert.equal(filas[0].costo, 245);
});

check("una fila sin cantidad se reporta, no se inventa", () => {
  const { filas, ignoradas } = leerPlantilla([ENCABEZADOS, ["A9999", "Algo", "", 100, "", ""]]);
  assert.equal(filas.length, 0);
  assert.equal(ignoradas.length, 1);
  assert.match(ignoradas[0].motivo, /cantidad/);
});

check("el reporte de resurtido anterior también carga, por alias", () => {
  // Generated before the template existed: "Pedir" and "Costo unit.".
  // The row carries BOTH "Stock actual" (2) and "Pedir" (8) — binding the wrong
  // one is the failure this whole module exists to prevent.
  const viejo = [
    ["Inventario", "SKU", "Producto", "Stock actual", "Meta", "Pedir", "Costo unit."],
    ["Pana's Batteries", "A2655", "BAT IPH 13", 2, 10, 8, 169],
  ];
  assert.equal(esPlantilla(viejo), true);
  const f = leerPlantilla(viejo).filas[0];
  assert.equal(f.cantidad, 8, `tomó ${f.cantidad} — 2 sería la existencia actual`);
  assert.equal(f.costo, 169);
});

check("una hoja sin columna de cantidad NO se trata como plantilla", () => {
  // Missing a required column: it must fall to the heuristic parser rather than
  // be read deterministically with a hole in it.
  const sinCantidad = [
    ["SKU", "Producto", "Costo unitario"],
    ["A2655", "BAT IPH 13", 169],
  ];
  assert.equal(esPlantilla(sinCantidad), false, "lo reconoció sin cantidad");
});

check("'Stock actual' nunca se confunde con la cantidad a entrar", () => {
  const conAmbas = [
    [...ENCABEZADOS, "Stock actual"],
    ["A2655", "BAT IPH 13", 8, 169, "", "", 999],
  ];
  const f = leerPlantilla(conAmbas).filas[0];
  assert.equal(f.cantidad, 8, `tomó ${f.cantidad} — si es 999 leyó la existencia actual`);
});

// Round trip through the real XLSX serializer: what the download route writes
// must be what the parser reads. A template that can't read its own output is
// worse than no template — the user follows instructions and it still fails.
check("ida y vuelta: lo generado se vuelve a leer", () => {
  const hojaGen = XLSX.utils.aoa_to_sheet([
    ENCABEZADOS,
    ["A2655", "BAT IPH 13", 8, 169, "PB-13", 10],
    ["iphone-11-jk", "iPhone 11 JK", 5, 245, "", ""],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hojaGen, PLANTILLA_HOJA);
  // Second sheet, as the route emits — the parser must still find the data one.
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Instrucciones"]]), "Instrucciones");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const leido = XLSX.read(buf, { type: "buffer" });
  assert.equal(leido.SheetNames[0], PLANTILLA_HOJA, "la hoja de datos debe ir primero");

  const grid = XLSX.utils.sheet_to_json<unknown[]>(leido.Sheets[PLANTILLA_HOJA], {
    header: 1, defval: "",
  });
  assert.equal(esPlantilla(grid), true, "no reconoció su propia salida");
  const { filas } = leerPlantilla(grid);
  assert.equal(filas.length, 2);
  assert.equal(filas[0].cantidad, 8);
  assert.equal(filas[0].costo, 169);       // número, no texto
  assert.equal(filas[0].skuProveedor, "PB-13");
  assert.equal(filas[0].pedido, 10);
  assert.equal(filas[1].pedido, null, "celda vacía debe quedar en null, no 0");
});

// The real file, when it's on this machine: the one the shop actually uploads.
const REAL = "/Users/antoniogonzalez/Downloads/Resurtido Panas 05-08-26 - con costos.xlsx";
if (existsSync(REAL)) {
  const wb = XLSX.read(readFileSync(REAL), { type: "buffer" });
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1, defval: "",
  });
  check("archivo real: reconocido como plantilla", () => {
    assert.equal(esPlantilla(grid), true);
  });
  check("archivo real: 15 productos, cero basura", () => {
    const { filas } = leerPlantilla(grid);
    assert.equal(filas.length, 15, `leyó ${filas.length}`);
    const basura = filas.filter((f) => /total|subtotal|costos unitarios/i.test(f.producto));
    assert.equal(basura.length, 0, `basura: ${basura.map((f) => f.producto).join(" | ")}`);
  });
  check("archivo real: cantidades y costos correctos", () => {
    const { filas } = leerPlantilla(grid);
    const a2655 = filas.find((f) => f.sku === "A2655")!;
    assert.equal(a2655.cantidad, 8, "8 a pedir, no 2 de existencia actual");
    assert.equal(a2655.costo, 169);
    const piezas = filas.reduce((s, f) => s + f.cantidad, 0);
    assert.equal(piezas, 58, `piezas=${piezas}`);
    const importe = filas.reduce((s, f) => s + f.cantidad * (f.costo ?? 0), 0);
    assert.equal(importe, 11273, `importe=${importe}`);
  });
} else {
  console.log("· archivo real no está en este equipo, omitido");
}

console.log(fallos === 0 ? "\nTodo en orden." : `\n${fallos} fallo(s).`);
process.exit(fallos ? 1 : 0);
