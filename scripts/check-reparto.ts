import assert from "node:assert/strict";
import { repartir, entregaTexto, proximaRuta, proximoExpres, opcionesEntrega, ahoraMx, type Almacen } from "../modules/agent/reparto.ts";

// Guadalajara (Yoko): truck Mon/Wed/Fri; Monday's closes Saturday 10:00, the
// others the day before at 16:00. Exprés: next business day ordering before 16:00, +$100.
const RUTA = [
  { llega: 1, corte_dia: 6, corte: "10:00" },
  { llega: 3, corte_dia: 2, corte: "16:00" },
  { llega: 5, corte_dia: 4, corte: "16:00" },
];
const EXPRES = { activo: true, dias: 1, corte: "16:00", costo: 100 };
const a = (almacen: string, existencia: number, precio_mxn: number, mostrador: boolean): Almacen => ({
  product_id: almacen, nombre: "BOMBA", almacen, existencia, precio_mxn, entrega_dias: mostrador ? 0 : null, imagen: null,
  es_mostrador: mostrador, ruta: mostrador ? null : RUTA, expres: mostrador ? { ...EXPRES, activo: false } : EXPRES,
});
const mostrador = a("Mostrador", 1, 2220, true);
const gdl = a("GUADALAJARA", 100, 2450, false);

// 4 wanted, 1 here: 1 here + 3 from Guadalajara at its own price.
const r = repartir([mostrador, gdl], 4);
assert.deepEqual(r.lineas.map((l) => [l.almacen, l.qty, l.precio_mxn]), [["Mostrador", 1, 2220], ["GUADALAJARA", 3, 2450]]);
assert.equal(r.falta, 0);
const solo = repartir([mostrador], 4);
assert.deepEqual([solo.lineas.length, solo.lineas[0].qty, solo.falta], [1, 1, 3]);
assert.equal(repartir([a("X", 5, 0, true), a("Y", 0, 10, true)], 2).lineas.length, 0);
assert.equal(entregaTexto(0), "en tienda, inmediata");
assert.equal(entregaTexto(null), "tiempo de entrega por confirmar");

const mx = (iso: string) => new Date(iso + "Z"); // wall clock as UTC fields
const dia = (x: { llega: Date } | null) => x!.llega.toISOString().slice(0, 10);
// Route: each truck day has its own cutoff.
assert.equal(dia(proximaRuta(RUTA, mx("2026-11-11T11:00"))), "2026-11-13"); // Wed → Fri (cut Thu 16:00)
assert.equal(dia(proximaRuta(RUTA, mx("2026-11-12T16:00"))), "2026-11-16"); // Thu at 4 → Mon (cut Sat 10:00)
assert.equal(dia(proximaRuta(RUTA, mx("2026-11-14T09:59"))), "2026-11-16"); // Sat before 10 → Mon
assert.equal(dia(proximaRuta(RUTA, mx("2026-11-14T10:00"))), "2026-11-18"); // Sat at 10 → Wed
assert.equal(dia(proximaRuta(RUTA, mx("2026-11-17T15:59"))), "2026-11-18"); // Tue before 4 → Wed
// Exprés: next business day before 16:00; Saturday's skips Sunday.
assert.equal(dia(proximoExpres(EXPRES, mx("2026-11-11T11:00"))), "2026-11-12");
assert.equal(dia(proximoExpres(EXPRES, mx("2026-11-11T16:30"))), "2026-11-13");
assert.equal(dia(proximoExpres(EXPRES, mx("2026-11-14T12:00"))), "2026-11-16");
assert.equal(proximoExpres({ ...EXPRES, activo: false }, mx("2026-11-11T11:00")), null);
assert.equal(ahoraMx(new Date("2026-11-12T16:30:00Z")).toISOString().slice(0, 16), "2026-11-12T10:30");

// The customer picks: Wednesday 11:00 → ruta Friday (free) or exprés Thursday (+$100).
const ops = opcionesEntrega(gdl, mx("2026-11-11T11:00"));
assert.deepEqual(ops.map((o) => [o.modo, o.fecha, o.cargo_mxn]), [["ruta", "2026-11-13", 0], ["expres", "2026-11-12", 100]]);
assert.equal(ops[0].corte, "2026-11-12T22:00:00.000Z"); // Thu 16:00 Mexico City
// Tuesday before 16:00: Wednesday's truck arrives as soon as exprés would, so no exprés.
assert.deepEqual(opcionesEntrega(gdl, mx("2026-11-17T11:00")).map((o) => o.modo), ["ruta"]);
assert.deepEqual(opcionesEntrega(mostrador, mx("2026-11-11T11:00")), []);
assert.deepEqual(opcionesEntrega({ ...gdl, ruta: null, expres: { ...EXPRES, activo: false } }, mx("2026-11-11T11:00")), []);
console.log("check-reparto ok");
