import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { formatMXN } from "@/lib/money";

export type PdfVariant = "internal" | "public";

export type PdfRow = {
  sku: string;
  name: string;
  category: string | null;
  brand: string | null;
  size: string | null;
  cost_cents: number;
  price_cents: number;
  quantity: number;
};

const styles = StyleSheet.create({
  page: {
    paddingVertical: 36,
    paddingHorizontal: 32,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  header: {
    marginBottom: 14,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
    paddingBottom: 10,
  },
  title: { fontSize: 17, fontFamily: "Helvetica-Bold" },
  meta: { marginTop: 3, fontSize: 9, color: "#64748b" },
  kpis: { flexDirection: "row", marginTop: 8 },
  kpi: { fontSize: 9, color: "#334155", marginRight: 18 },
  kpiVal: { fontFamily: "Helvetica-Bold" },
  thead: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  th: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: "#475569" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderColor: "#eef2f7",
  },
  rowAlt: { backgroundColor: "#fafafa" },
  sub: { color: "#94a3b8", fontSize: 7, marginTop: 1 },
  out: { color: "#dc2626" },
  right: { textAlign: "right" },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    textAlign: "center",
    fontSize: 8,
    color: "#94a3b8",
  },
});

// Column widths per variant.
const W = {
  internal: { sku: "14%", name: "30%", cat: "12%", cost: "11%", price: "11%", margin: "11%", stock: "11%" },
  public: { sku: "16%", name: "50%", cat: "18%", price: "16%" },
} as const;

function marginPct(cost: number, price: number): string {
  if (cost <= 0) return "—";
  return `${Math.round(((price - cost) / cost) * 100)}%`;
}

export function InventoryPdf({
  rows,
  generatedAt,
  variant,
}: {
  rows: PdfRow[];
  generatedAt: string;
  variant: PdfVariant;
}) {
  const isInternal = variant === "internal";
  const units = rows.reduce((s, r) => s + r.quantity, 0);
  const value = rows.reduce((s, r) => s + r.price_cents * r.quantity, 0);

  return (
    <Document
      title={isInternal ? "Inventario" : "Lista de precios"}
      author="Fiable"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {isInternal ? "Inventario" : "Lista de precios"}
          </Text>
          <Text style={styles.meta}>Generado el {generatedAt}</Text>
          {isInternal && (
            <View style={styles.kpis}>
              <Text style={styles.kpi}>
                Productos: <Text style={styles.kpiVal}>{rows.length}</Text>
              </Text>
              <Text style={styles.kpi}>
                Unidades: <Text style={styles.kpiVal}>{units}</Text>
              </Text>
              <Text style={styles.kpi}>
                Valor (venta): <Text style={styles.kpiVal}>{formatMXN(value)}</Text>
              </Text>
            </View>
          )}
        </View>

        {/* Header row */}
        <View style={styles.thead} fixed>
          {isInternal ? (
            <>
              <Text style={[styles.th, { width: W.internal.sku }]}>SKU</Text>
              <Text style={[styles.th, { width: W.internal.name }]}>PRODUCTO</Text>
              <Text style={[styles.th, { width: W.internal.cat }]}>CATEGORÍA</Text>
              <Text style={[styles.th, styles.right, { width: W.internal.cost }]}>COSTO</Text>
              <Text style={[styles.th, styles.right, { width: W.internal.price }]}>PRECIO</Text>
              <Text style={[styles.th, styles.right, { width: W.internal.margin }]}>MARGEN</Text>
              <Text style={[styles.th, styles.right, { width: W.internal.stock }]}>STOCK</Text>
            </>
          ) : (
            <>
              <Text style={[styles.th, { width: W.public.sku }]}>SKU</Text>
              <Text style={[styles.th, { width: W.public.name }]}>PRODUCTO</Text>
              <Text style={[styles.th, { width: W.public.cat }]}>CATEGORÍA</Text>
              <Text style={[styles.th, styles.right, { width: W.public.price }]}>PRECIO</Text>
            </>
          )}
        </View>

        {rows.map((r, i) => (
          <View
            key={`${r.sku}-${i}`}
            style={i % 2 === 1 ? [styles.row, styles.rowAlt] : styles.row}
            wrap={false}
          >
            {isInternal ? (
              <>
                <Text style={{ width: W.internal.sku }}>{r.sku}</Text>
                <View style={{ width: W.internal.name, paddingRight: 6 }}>
                  <Text>{r.name}</Text>
                  {(r.brand || r.size) && (
                    <Text style={styles.sub}>
                      {[r.brand, r.size].filter(Boolean).join(" · ")}
                    </Text>
                  )}
                </View>
                <Text style={{ width: W.internal.cat, color: "#475569" }}>
                  {r.category ?? "—"}
                </Text>
                <Text style={[styles.right, { width: W.internal.cost }]}>
                  {formatMXN(r.cost_cents)}
                </Text>
                <Text style={[styles.right, { width: W.internal.price }]}>
                  {formatMXN(r.price_cents)}
                </Text>
                <Text style={[styles.right, { width: W.internal.margin }]}>
                  {marginPct(r.cost_cents, r.price_cents)}
                </Text>
                <Text
                  style={
                    r.quantity === 0
                      ? [styles.right, styles.out, { width: W.internal.stock }]
                      : [styles.right, { width: W.internal.stock }]
                  }
                >
                  {r.quantity}
                </Text>
              </>
            ) : (
              <>
                <Text style={{ width: W.public.sku }}>{r.sku}</Text>
                <View style={{ width: W.public.name, paddingRight: 6 }}>
                  <Text>{r.name}</Text>
                  {(r.brand || r.size) && (
                    <Text style={styles.sub}>
                      {[r.brand, r.size].filter(Boolean).join(" · ")}
                    </Text>
                  )}
                </View>
                <Text style={{ width: W.public.cat, color: "#475569" }}>
                  {r.category ?? "—"}
                </Text>
                <Text style={[styles.right, { width: W.public.price }]}>
                  {formatMXN(r.price_cents)}
                </Text>
              </>
            )}
          </View>
        ))}

        <Text
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Fiable · Página ${pageNumber} de ${totalPages}`
          }
          fixed
        />
      </Page>
    </Document>
  );
}
