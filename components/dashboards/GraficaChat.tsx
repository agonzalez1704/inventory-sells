"use client";

import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, LabelList, Cell,
} from "recharts";

// Gráfica generativa del chat (Recharts), afinada con el método de dataviz:
// una serie = UN matiz (el acento de marca), barras delgadas con solo la punta
// redondeada (ancladas a la base), reja y ejes recesivos, tooltip por marca y
// valores en tinta de texto — nunca en el color de la serie.

export type DatosGrafica = {
  titulo: string;
  unidad: "mxn" | "numero";
  tipo?: "barras" | "linea";
  series: { etiqueta: string; valor: number }[];
};

const ACENTO = "hsl(var(--brand))";
const TINTA_MUTED = "hsl(var(--muted-foreground))";

function formateador(unidad: "mxn" | "numero") {
  // LabelFormatter de Recharts pasa RenderableText; se normaliza a numero
  return (v: unknown) => {
    const n = typeof v === "number" ? v : Number(v ?? 0);
    return unidad === "mxn" ? `$${Math.round(n).toLocaleString("es-MX")}` : n.toLocaleString("es-MX");
  };
}

function CajaTooltip({ active, payload, label, fmt }: {
  active?: boolean; payload?: { value?: number }[]; label?: string; fmt: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs shadow-lg">
      <p className="text-muted">{label}</p>
      <p className="nums font-semibold text-foreground">{fmt(payload[0]?.value ?? 0)}</p>
    </div>
  );
}

export function GraficaChat({ datos }: { datos: DatosGrafica }) {
  const fmt = formateador(datos.unidad);
  const serie = datos.series.map((s) => ({ ...s, valor: Math.max(0, s.valor) }));
  // etiquetas tipo fecha o muchas categorías → barras verticales (tiempo);
  // nombres largos → barras horizontales, que se leen sin girar la cabeza
  const esTiempo = serie.length > 8 || serie.every((s) => /^\d{1,2}[\/-]\d{1,2}/.test(s.etiqueta));
  const alto = esTiempo || datos.tipo === "linea" ? 220 : Math.max(120, serie.length * 44 + 24);

  return (
    <div className="w-full min-w-[300px] rounded-2xl border border-border bg-background p-4">
      <p className="text-sm font-semibold">{datos.titulo}</p>
      <div className="mt-3" style={{ height: alto }}>
        <ResponsiveContainer width="100%" height="100%">
          {datos.tipo === "linea" ? (
            <LineChart data={serie} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
              <XAxis dataKey="etiqueta" tick={{ fill: TINTA_MUTED, fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: TINTA_MUTED, fontSize: 11 }} tickLine={false} axisLine={false} width={52}
                tickFormatter={(v: number) => (datos.unidad === "mxn" ? `$${(v / 1000).toFixed(v >= 1000 ? 0 : 1)}k` : String(v))} />
              <Tooltip content={<CajaTooltip fmt={fmt} />} cursor={{ stroke: TINTA_MUTED, strokeDasharray: "3 3" }} />
              <Line dataKey="valor" stroke={ACENTO} strokeWidth={2} dot={{ r: 3, fill: ACENTO, strokeWidth: 0 }}
                activeDot={{ r: 5 }} isAnimationActive={false} />
            </LineChart>
          ) : esTiempo ? (
            <BarChart data={serie} margin={{ top: 18, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
              <XAxis dataKey="etiqueta" tick={{ fill: TINTA_MUTED, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis hide />
              <Tooltip content={<CajaTooltip fmt={fmt} />} cursor={{ fill: "hsl(var(--muted))" }} />
              <Bar dataKey="valor" fill={ACENTO} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
                <LabelList dataKey="valor" position="top" formatter={fmt} style={{ fill: TINTA_MUTED, fontSize: 10 }} />
                {serie.map((_, i) => <Cell key={i} />)}
              </Bar>
            </BarChart>
          ) : (
            <BarChart data={serie} layout="vertical" margin={{ top: 0, right: 56, left: 8, bottom: 0 }} barCategoryGap="30%">
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="etiqueta" tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }}
                tickLine={false} axisLine={false} width={110} />
              <Tooltip content={<CajaTooltip fmt={fmt} />} cursor={{ fill: "hsl(var(--muted))" }} />
              <Bar dataKey="valor" fill={ACENTO} radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false}>
                <LabelList dataKey="valor" position="right" formatter={fmt} style={{ fill: "hsl(var(--foreground))", fontSize: 11, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
