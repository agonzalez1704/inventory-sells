// One table out of the app as a file: PDF to hand over, Excel to keep working
// on. Both libraries load on demand — nobody pays for them until they export.
//
// Money travels as a NUMBER, not a formatted string: in Excel a column of
// "$250.00" text cannot be summed, and summing is the first thing anyone does.

export type TipoColumna = "texto" | "numero" | "dinero";

export type ColumnaExport<T> = {
  id: string;
  titulo: string;
  tipo: TipoColumna;
  valor: (fila: T) => string | number;
  /** The total row's cell; omitted = blank. */
  total?: number | string;
};

/** Header, body and total rows as plain values — what both formats print. */
export function matrizExport<T>(columnas: ColumnaExport<T>[], filas: T[]) {
  const conTotal = columnas.some((c) => c.total !== undefined);
  return {
    encabezado: columnas.map((c) => c.titulo),
    cuerpo: filas.map((f) => columnas.map((c) => c.valor(f))),
    total: conTotal ? columnas.map((c, i) => (c.total !== undefined ? c.total : i === 0 ? "Total" : "")) : null,
  };
}

const pesos = (n: number) =>
  "$" + n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function exportarPdf<T>(opts: {
  archivo: string;
  titulo: string;
  subtitulo: string;
  columnas: ColumnaExport<T>[];
  filas: T[];
}): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const { encabezado, cuerpo, total } = matrizExport(opts.columnas, opts.filas);
  // The PDF's built-in font is WinAnsi: an arrow prints as "!'". Swap the
  // characters the app actually uses for ones the font has.
  const seguro = (t: string) => t.replace(/→/g, "–").replace(/[“”]/g, '"');
  const texto = (v: string | number, i: number) =>
    typeof v === "number" && opts.columnas[i].tipo === "dinero" ? pesos(v) : seguro(String(v));

  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: opts.columnas.length > 5 ? "landscape" : "portrait" });
  doc.setFontSize(15);
  doc.text(seguro(opts.titulo), 40, 46);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(seguro(opts.subtitulo), 40, 62);
  autoTable(doc, {
    startY: 78,
    head: [encabezado],
    body: cuerpo.map((r) => r.map(texto)),
    foot: total ? [total.map(texto)] : undefined,
    showFoot: "lastPage",
    styles: { fontSize: 9, cellPadding: 5, overflow: "linebreak" },
    headStyles: { fillColor: [24, 24, 27], textColor: 255 },
    footStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: "bold" },
    // Numbers line up on the right in every row — header and total included,
    // which columnStyles alone does not reach.
    didParseCell: (d) => {
      if (opts.columnas[d.column.index]?.tipo !== "texto") d.cell.styles.halign = "right";
    },
  });
  doc.save(`${opts.archivo}.pdf`);
}

export async function exportarXlsx<T>(opts: {
  archivo: string;
  hoja: string;
  columnas: ColumnaExport<T>[];
  filas: T[];
}): Promise<void> {
  const XLSX = await import("xlsx");
  const { encabezado, cuerpo, total } = matrizExport(opts.columnas, opts.filas);
  const filas = [encabezado, ...cuerpo, ...(total ? [total] : [])];
  const ws = XLSX.utils.aoa_to_sheet(filas);
  // Money columns get a money format but stay numbers, so they sum.
  opts.columnas.forEach((c, j) => {
    if (c.tipo !== "dinero") return;
    for (let i = 1; i < filas.length; i++) {
      const celda = ws[XLSX.utils.encode_cell({ r: i, c: j })];
      if (celda && typeof celda.v === "number") celda.z = '"$"#,##0.00';
    }
  });
  ws["!cols"] = opts.columnas.map((c) => ({ wch: c.tipo === "texto" ? 36 : 14 }));
  const wb = XLSX.utils.book_new();
  // Sheet names: 31 chars, none of \ / ? * [ ] :
  XLSX.utils.book_append_sheet(wb, ws, opts.hoja.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Hoja1");
  XLSX.writeFile(wb, `${opts.archivo}.xlsx`);
}
