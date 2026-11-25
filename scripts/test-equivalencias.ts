// The equivalencias table built from the owner's Excel.
// node --experimental-strip-types scripts/test-equivalencias.ts [CNV.xlsx]
//
// Rules pinned here: headers name the brand (VAZLO = Baslo), a cell can hold
// several numbers, rows sharing a number of the same brand are one part, the
// same digits under two brands are NOT, manual links survive a reload, and a
// part already in the system keeps its group id.
import { armarTabla, compactar, leerEquivalencias, marcaDeEncabezado } from "../modules/catalogo/equivalencias-excel.ts";

let fallas = 0;
const falla = (msg: string) => {
  console.error("✗", msg);
  fallas++;
};
const ok = (c: boolean, msg: string) => c || falla(msg);

ok(marcaDeEncabezado("Codigo GROB") === "GROB", "Codigo GROB");
ok(marcaDeEncabezado("Código SYD") === "SYD", "Código SYD");
ok(marcaDeEncabezado("VAZLO") === "BASLO", "VAZLO es Baslo");
ok(marcaDeEncabezado("") === null, "encabezado vacío");
ok(compactar("10-009") === compactar("10 009") && compactar("10009") === "10009", "compactar");

const grid: unknown[][] = [
  ["Codigo GROB", "Codigo SYD", "VAZLO", "YOKOMITSU"],
  ["6709053", 7000425, "64-5295", "SANN0902"],
  ["6709053-S", 7000425, null, null], // shares SYD → same part
  [1025001, null, null, null], // Grob 1025001…
  ["K-1", "1025001", null, "SANG0111 / SANG0121"], // …is not SYD 1025001
  [null, null, null, null],
];
const leido = leerEquivalencias(grid);
ok(leido !== null, "leer");
const r = leido!.renglones;
ok(r.length === 4, `renglones ${r.length}`);
ok(r[3].filter((n) => n.marca === "YOKOMITSU").length === 2, "celda con dos claves");

let n = 0;
const id = () => `nuevo-${++n}`;
const actual = [
  { marca: "GROB", clave: "6709053", grupo: "viejo-A", origen: "excel" as const },
  { marca: "GROB", clave: "BORRADA", grupo: "viejo-B", origen: "excel" as const },
  // A manual link of K-1 with a part the Excel doesn't have.
  { marca: "GROB", clave: "K-1", grupo: "viejo-M", origen: "manual" as const },
  { marca: "SIN MARCA", clave: "X-77", grupo: "viejo-M", origen: "manual" as const },
];
const { filas, resumen } = armarTabla(r, actual, id);
const g = (marca: string, clave: string) => filas.find((f) => f.marca === marca && compactar(f.clave) === compactar(clave))?.grupo;

ok(g("GROB", "6709053") === "viejo-A", "conserva el id del grupo");
ok(g("GROB", "6709053-S") === "viejo-A" && g("YOKOMITSU", "SANN0902") === "viejo-A", "renglones con el mismo SYD son una pieza");
ok(g("GROB", "1025001") !== g("SYD", "1025001"), "Grob 1025001 no es SYD 1025001");
ok(g("SIN MARCA", "X-77") === g("GROB", "K-1"), "la liga manual se une a su renglón");
ok(filas.find((f) => f.clave === "K-1")?.origen === "manual", "la liga manual sigue marcada");
ok(!filas.some((f) => f.clave === "BORRADA"), "lo que el archivo quita, se quita");
ok(resumen.quitadas === 1, `quitadas ${resumen.quitadas}`);
ok(resumen.grupos === 3, `grupos ${resumen.grupos}`);
ok(new Set(filas.map((f) => `${f.marca}|${compactar(f.clave)}`)).size === filas.length, "un nodo, una fila");

// The real file, when given.
const archivo = process.argv[2];
if (archivo) {
  const XLSX = await import("xlsx");
  const fs = await import("node:fs");
  const wb = XLSX.read(fs.readFileSync(archivo), { type: "buffer" });
  const hoja = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null, raw: true });
  const l = leerEquivalencias(hoja);
  if (!l) falla("el archivo no tiene columnas de marca");
  else {
    const t = armarTabla(l.renglones, [], id);
    console.log("marcas", l.marcas.join(", "));
    console.log(JSON.stringify(t.resumen));
    const tam = new Map<string, number>();
    for (const f of t.filas) tam.set(f.grupo, (tam.get(f.grupo) ?? 0) + 1);
    console.log("claves en el grupo más grande", Math.max(...tam.values()));
  }
}

if (fallas) process.exit(1);
console.log("✓ equivalencias");
