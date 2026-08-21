import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

// The purchase itself, on paper: supplier, terms, every line at cost, totals.
//
// The contra-recibo next door is the DISCREPANCY document — it only matters
// when the boxes disagreed with the invoice. This one is the record: what the
// shop bought, on what terms, for the folder, the accountant, or the supplier
// asking what exactly you claim you ordered.

export type LineaCompraPdf = {
  sku: string;
  nombre: string;
  qty: number;
  costoCents: number;
  totalCents: number;
};

export type CompraPdfData = {
  negocio: string;
  proveedor: string;
  folio: string | null;
  fecha: string; // yyyy-mm-dd
  estado: string;
  condicion: string; // "Contado" | "Crédito 30 días · vence 2026-09-01"
  prontoPago: string | null; // "3% pagando antes de 10 días"
  notas: string | null;
  generadoEn: string; // ISO
  lineas: LineaCompraPdf[];
  capturadoCents: number;
  totalFacturaCents: number;
};

const money = (c: number) =>
  `$${(c / 100).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

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
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 3,
  },
  cSku: { width: "18%" },
  cNombre: { width: "42%" },
  cQty: { width: "10%", textAlign: "right" },
  cCosto: { width: "15%", textAlign: "right" },
  cTotal: { width: "15%", textAlign: "right" },
  totales: { marginTop: 10, alignItems: "flex-end", gap: 2 },
  totalFila: { flexDirection: "row", gap: 12 },
  notas: { marginTop: 12, fontSize: 8.5, color: "#374151" },
  pie: { position: "absolute", bottom: 24, left: 36, right: 36, fontSize: 7, color: "#9ca3af" },
});

export function CompraPdf({ d }: { d: CompraPdfData }) {
  return (
    <Document title={`Compra ${d.folio ?? ""}`.trim()}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.h1}>{d.negocio}</Text>
        <Text style={s.sub}>Compra a proveedor</Text>

        <View style={s.meta}>
          <View style={s.metaCol}>
            <Text style={s.label}>Proveedor</Text>
            <Text style={s.valor}>{d.proveedor}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.label}>Folio factura</Text>
            <Text style={s.valor}>{d.folio ?? "—"}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.label}>Fecha de ingreso</Text>
            <Text style={s.valor}>{d.fecha}</Text>
          </View>
          <View style={s.metaCol}>
            <Text style={s.label}>Estado</Text>
            <Text style={s.valor}>{d.estado}</Text>
          </View>
        </View>

        <View style={s.meta}>
          <View style={s.metaCol}>
            <Text style={s.label}>Condición</Text>
            <Text style={s.valor}>{d.condicion}</Text>
          </View>
          {d.prontoPago && (
            <View style={s.metaCol}>
              <Text style={s.label}>Pronto pago</Text>
              <Text style={s.valor}>{d.prontoPago}</Text>
            </View>
          )}
        </View>

        <View style={s.th}>
          <Text style={s.cSku}>SKU</Text>
          <Text style={s.cNombre}>Producto</Text>
          <Text style={s.cQty}>Cant.</Text>
          <Text style={s.cCosto}>Costo u.</Text>
          <Text style={s.cTotal}>Total</Text>
        </View>
        {d.lineas.map((l, i) => (
          <View key={i} style={s.tr} wrap={false}>
            <Text style={s.cSku}>{l.sku}</Text>
            <Text style={s.cNombre}>{l.nombre}</Text>
            <Text style={s.cQty}>{l.qty}</Text>
            <Text style={s.cCosto}>{money(l.costoCents)}</Text>
            <Text style={s.cTotal}>{money(l.totalCents)}</Text>
          </View>
        ))}

        <View style={s.totales}>
          <View style={s.totalFila}>
            <Text style={s.label}>Capturado</Text>
            <Text style={s.valor}>{money(d.capturadoCents)}</Text>
          </View>
          <View style={s.totalFila}>
            <Text style={s.label}>Total factura</Text>
            <Text style={s.valor}>{money(d.totalFacturaCents)}</Text>
          </View>
          {d.capturadoCents !== d.totalFacturaCents && (
            <View style={s.totalFila}>
              <Text style={s.label}>Diferencia</Text>
              <Text style={s.valor}>{money(d.totalFacturaCents - d.capturadoCents)}</Text>
            </View>
          )}
        </View>

        {d.notas && <Text style={s.notas}>Notas: {d.notas}</Text>}

        <Text style={s.pie} fixed>
          Generado el {new Date(d.generadoEn).toLocaleString("es-MX")} · {d.negocio}
        </Text>
      </Page>
    </Document>
  );
}
