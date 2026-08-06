import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

// The document the shop hands back to the supplier: what was ordered, what
// actually turned up, and what is therefore still owed in goods or money.
//
// It exists because the discrepancy only lives in this app. The supplier's
// invoice says one thing, the boxes said another, and without something on paper
// the conversation is one person's memory against another's.

export type LineaContraRecibo = {
  sku: string;
  nombre: string;
  pedido: number | null;
  recibido: number;
  costoCents: number;
};

export type ContraReciboData = {
  negocio: string;
  proveedor: string;
  folio: string | null;
  fecha: string; // yyyy-mm-dd
  generadoEn: string; // ISO
  lineas: LineaContraRecibo[];
  totalFacturaCents: number;
  capturadoCents: number;
};

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#111827" },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  sub: { fontSize: 9, color: "#6b7280", marginBottom: 14 },
  meta: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  metaCol: { flexDirection: "column", gap: 2 },
  label: { fontSize: 7.5, color: "#6b7280", textTransform: "uppercase" },
  valor: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  th: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#111827",
    paddingBottom: 4,
    marginBottom: 2,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
  },
  tr: {
    flexDirection: "row",
    paddingVertical: 3.5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
  },
  cSku: { width: "18%" },
  cNom: { width: "40%" },
  cNum: { width: "10%", textAlign: "right" },
  cFalta: { width: "12%", textAlign: "right", fontFamily: "Helvetica-Bold" },
  falta: { color: "#b45309" },
  totales: { marginTop: 14, alignSelf: "flex-end", width: "52%", gap: 3 },
  fila: { flexDirection: "row", justifyContent: "space-between" },
  filaFuerte: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#111827",
    paddingTop: 4,
    marginTop: 3,
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
  },
  nota: { marginTop: 20, fontSize: 8, color: "#6b7280", lineHeight: 1.5 },
  firmas: { flexDirection: "row", justifyContent: "space-between", marginTop: 40 },
  firma: { width: "44%", borderTopWidth: 0.5, borderTopColor: "#9ca3af", paddingTop: 4, fontSize: 8, textAlign: "center", color: "#6b7280" },
});

const mxn = (c: number) =>
  `$${(c / 100).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ContraReciboPdf({ d }: { d: ContraReciboData }) {
  const faltantes = d.lineas.filter((l) => l.pedido != null && l.recibido < l.pedido);
  const diferencia = d.totalFacturaCents - d.capturadoCents;

  return (
    <Document title={`Contra recibo ${d.folio ?? ""}`}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.h1}>Contra recibo</Text>
        <Text style={s.sub}>{d.negocio}</Text>

        <View style={s.meta}>
          <View style={s.metaCol}>
            <Text style={s.label}>Proveedor</Text>
            <Text style={s.valor}>{d.proveedor}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.label}>Factura</Text>
            <Text style={s.valor}>{d.folio || "sin folio"}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.label}>Fecha de ingreso</Text>
            <Text style={s.valor}>{d.fecha}</Text>
          </View>
        </View>

        <View style={s.th}>
          <Text style={s.cSku}>SKU</Text>
          <Text style={s.cNom}>Producto</Text>
          <Text style={s.cNum}>Pedido</Text>
          <Text style={s.cNum}>Recibido</Text>
          <Text style={s.cFalta}>Faltante</Text>
        </View>

        {d.lineas.map((l) => {
          const falta = l.pedido != null ? l.pedido - l.recibido : 0;
          return (
            <View key={l.sku} style={s.tr} wrap={false}>
              <Text style={s.cSku}>{l.sku}</Text>
              <Text style={s.cNom}>{l.nombre}</Text>
              <Text style={s.cNum}>{l.pedido ?? "—"}</Text>
              <Text style={s.cNum}>{l.recibido}</Text>
              <Text style={[s.cFalta, falta > 0 ? s.falta : {}]}>
                {falta > 0 ? falta : "—"}
              </Text>
            </View>
          );
        })}

        <View style={s.totales}>
          <View style={s.fila}>
            <Text>Total de la factura</Text>
            <Text>{mxn(d.totalFacturaCents)}</Text>
          </View>
          <View style={s.fila}>
            <Text>Mercancía recibida</Text>
            <Text>{mxn(d.capturadoCents)}</Text>
          </View>
          <View style={s.filaFuerte}>
            <Text>{diferencia >= 0 ? "Diferencia a favor" : "Excedente recibido"}</Text>
            <Text>{mxn(Math.abs(diferencia))}</Text>
          </View>
        </View>

        <Text style={s.nota}>
          {faltantes.length > 0
            ? `Se recibieron ${d.lineas.reduce((a, l) => a + l.recibido, 0)} piezas de las ` +
              `${d.lineas.reduce((a, l) => a + (l.pedido ?? l.recibido), 0)} solicitadas. ` +
              `${faltantes.length} producto(s) llegaron incompletos. La diferencia de ` +
              `${mxn(Math.abs(diferencia))} queda pendiente de surtir o de abonar.`
            : `La diferencia de ${mxn(Math.abs(diferencia))} entre la factura y la mercancía ` +
              `recibida queda pendiente de aclarar con el proveedor.`}
        </Text>
        <Text style={s.nota}>
          Documento generado el {new Date(d.generadoEn).toLocaleString("es-MX")}. Ampara
          únicamente lo físicamente recibido en el domicilio del negocio.
        </Text>

        <View style={s.firmas}>
          <Text style={s.firma}>Recibió por {d.negocio}</Text>
          <Text style={s.firma}>Entregó / enterado por {d.proveedor}</Text>
        </View>
      </Page>
    </Document>
  );
}
