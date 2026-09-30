import type { DemandaAgrupada } from "@/modules/demanda/actions";

const TZ = "America/Mexico_City";

const TIPO: Record<string, string> = {
  pantalla: "Pantalla",
  bateria: "Batería",
  tapa: "Tapa",
  flex: "Flex",
  otro: "Otro",
};

const cuando = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    .format(new Date(iso));

const estado = (d: DemandaAgrupada) =>
  !d.product_id ? "No está en catálogo" : (d.existencia ?? 0) === 0 ? "En ceros" : `Hay ${d.existencia}`;

/**
 * "Piden y no hay", as a sheet the buyer takes to the supplier.
 *
 * A file, not a print: the shop's Chrome runs with kiosk printing so the roll
 * printer answers window.print() without a dialog, and there would be no "save
 * as PDF" to choose. jsPDF is loaded on demand — nobody selling pays for it.
 */
export async function construirDemandaPdf(filas: DemandaAgrupada[], dias: number, tienda: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const hoy = new Date();
  const piezas = filas.reduce((s, d) => s + d.piezas, 0);
  const esperando = filas.reduce((s, d) => s + d.esperando, 0);

  doc.setFontSize(16);
  doc.text("Piden y no hay", 40, 48);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(
    `${tienda} · últimos ${dias} días · ${filas.length} ${filas.length === 1 ? "modelo" : "modelos"} · ` +
      `${piezas} ${piezas === 1 ? "pieza" : "piezas"}${esperando > 0 ? ` · ${esperando} esperando` : ""}`,
    40,
    64,
  );
  doc.text(
    `Generado ${new Intl.DateTimeFormat("es-MX", { timeZone: TZ, dateStyle: "long", timeStyle: "short" }).format(hoy)}`,
    40,
    78,
  );

  autoTable(doc, {
    startY: 94,
    head: [["Pieza", "Tipo", "Estado", "Veces", "Piezas", "Última vez", "Clientes"]],
    body: filas.map((d) => [
      d.producto ?? d.texto,
      TIPO[d.tipo] ?? d.tipo,
      estado(d),
      String(d.veces),
      String(d.piezas),
      cuando(d.ultima),
      d.clientes ?? "",
    ]),
    styles: { fontSize: 9, cellPadding: 5, overflow: "linebreak" },
    headStyles: { fillColor: [24, 24, 27], textColor: 255 },
    // The two numbers the buyer reads down the page, and the piece it is about.
    columnStyles: {
      0: { cellWidth: 150, fontStyle: "bold" },
      3: { halign: "right", cellWidth: 40 },
      4: { halign: "right", cellWidth: 44 },
      6: { cellWidth: 100 },
    },
    // Someone will write on this: the ones nobody carries stand out.
    didParseCell: (data) => {
      if (data.section === "body" && filas[data.row.index] && !filas[data.row.index].product_id) {
        data.cell.styles.fillColor = [254, 242, 242];
      }
    },
  });

  return doc;
}

/** The download itself, named by the day the buyer asked for it. */
export async function pdfDemanda(filas: DemandaAgrupada[], dias: number, tienda: string): Promise<void> {
  const doc = await construirDemandaPdf(filas, dias, tienda);
  doc.save(`piden-y-no-hay-${new Date().toLocaleDateString("en-CA", { timeZone: TZ })}.pdf`);
}
