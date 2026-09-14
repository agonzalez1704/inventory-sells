"use client";

import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList, Legend,
} from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";

// Primitivas de widget del dashboard generativo. Método dataviz: una serie un
// matiz (acento); multi-serie y dona usan la paleta categórica VALIDADA en
// orden fijo, con etiquetas directas y huecos como codificación secundaria.

export type SerieDatos = { etiqueta: string; valor: number };
export type WidgetDatos =
  | { tipo: "kpi"; titulo: string; w: number; unidad: "mxn" | "numero"; valor: number; delta?: number | null }
  | { tipo: "serie"; titulo: string; w: number; forma: "linea" | "barras" | "area"; unidad: "mxn" | "numero"; series: { nombre: string; datos: SerieDatos[] }[] }
  | { tipo: "distribucion"; titulo: string; w: number; unidad: "mxn" | "numero"; datos: SerieDatos[] }
  | { tipo: "tabla"; titulo: string; w: number; columnas: string[]; filas: Record<string, string | number>[] }
  | { tipo: "nota"; titulo?: string; w: number; texto: string };

const ACENTO = "hsl(var(--brand))";
const MUTED = "hsl(var(--muted-foreground))";
// Paleta categórica en orden FIJO — validada (scripts/validate_palette, dark #141416).
const CATEGORICA = ["#ef4444", "#3b82f6", "#d97706", "#059669", "#8b5cf6"];

const fmt = (unidad: "mxn" | "numero") => (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return unidad === "mxn" ? `$${Math.round(n).toLocaleString("es-MX")}` : n.toLocaleString("es-MX");
};

function Caja({ titulo, w, children }: { titulo?: string; w: number; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4" style={{ gridColumn: `span ${Math.min(12, Math.max(2, w))}` }}>
      {titulo && <p className="text-sm font-semibold">{titulo}</p>}
      {children}
    </div>
  );
}

function TooltipCard({ active, payload, label, unidad }: {
  active?: boolean; payload?: { value?: number; name?: string; color?: string }[]; label?: string; unidad: "mxn" | "numero";
}) {
  if (!active || !payload?.length) return null;
  const f = fmt(unidad);
  return (
    <div className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs shadow-lg">
      <p className="text-muted">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="nums font-semibold text-foreground">
          {payload.length > 1 && <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />}
          {f(p.value ?? 0)}
        </p>
      ))}
    </div>
  );
}

export function Widget({ datos }: { datos: WidgetDatos }) {
  if (datos.tipo === "nota") {
    return (
      <Caja titulo={datos.titulo} w={datos.w}>
        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted">{datos.texto}</p>
      </Caja>
    );
  }

  if (datos.tipo === "kpi") {
    const f = fmt(datos.unidad);
    const d = datos.delta;
    return (
      <Caja w={datos.w}>
        <p className="text-xs text-muted">{datos.titulo}</p>
        <p className="nums mt-1.5 text-2xl font-semibold tracking-tight">{f(datos.valor)}</p>
        {d != null && (
          <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${d >= 0 ? "text-emerald-500" : "text-brand-strong"}`}>
            {d >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {(Math.abs(d) * 100).toFixed(1)}% vs periodo anterior
          </p>
        )}
      </Caja>
    );
  }

  if (datos.tipo === "tabla") {
    return (
      <Caja titulo={datos.titulo} w={datos.w}>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted">
              <tr>{datos.columnas.map((c) => <th key={c} className="pb-2 pr-4 capitalize">{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {datos.filas.length === 0 && <tr><td colSpan={datos.columnas.length} className="py-3 text-muted">Sin datos.</td></tr>}
              {datos.filas.map((fila, i) => (
                <tr key={i}>{datos.columnas.map((c) => <td key={c} className={`py-2 pr-4 ${typeof fila[c] === "number" ? "nums" : ""}`}>{String(fila[c] ?? "—")}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </Caja>
    );
  }

  if (datos.tipo === "distribucion") {
    const f = fmt(datos.unidad);
    const total = datos.datos.reduce((s, x) => s + x.valor, 0);
    return (
      <Caja titulo={datos.titulo} w={datos.w}>
        <div className="mt-2 flex items-center gap-4">
          <div className="h-40 w-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={datos.datos} dataKey="valor" nameKey="etiqueta" innerRadius={48} outerRadius={72}
                  paddingAngle={2} stroke="hsl(var(--background))" strokeWidth={2} isAnimationActive={false}>
                  {datos.datos.map((_, i) => <Cell key={i} fill={CATEGORICA[i % CATEGORICA.length]} />)}
                </Pie>
                <Tooltip content={<TooltipCard unidad={datos.unidad} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="min-w-0 flex-1 space-y-2 text-xs">
            {datos.datos.map((x, i) => (
              <li key={x.etiqueta}>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CATEGORICA[i % CATEGORICA.length] }} />
                  <span className="min-w-0 flex-1 truncate capitalize" title={x.etiqueta}>{x.etiqueta || "(sin dato)"}</span>
                </div>
                <div className="nums mt-0.5 flex justify-between pl-4 text-muted">
                  <span className="font-medium text-foreground">{f(x.valor)}</span>
                  <span>{total ? Math.round((x.valor / total) * 100) : 0}%</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Caja>
    );
  }

  // serie: linea / barras / area, 1..4 series
  const f = fmt(datos.unidad);
  const llaves = datos.series.map((s) => s.nombre);
  const combinado = new Map<string, Record<string, string | number>>();
  for (const s of datos.series) {
    for (const p of s.datos) {
      const fila = combinado.get(p.etiqueta) ?? { etiqueta: p.etiqueta };
      fila[s.nombre] = p.valor;
      combinado.set(p.etiqueta, fila);
    }
  }
  const data = [...combinado.values()];
  const multi = llaves.length > 1;
  const colorDe = (i: number) => (multi ? CATEGORICA[i % CATEGORICA.length] : ACENTO);
  const esCategorias = datos.forma === "barras" && data.length <= 8 && !data.every((d) => /^\d/.test(String(d.etiqueta)));

  const ejes = (
    <>
      <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
      <XAxis dataKey="etiqueta" tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
      <YAxis tick={{ fill: MUTED, fontSize: 11 }} tickLine={false} axisLine={false} width={48}
        tickFormatter={(v: number) => (datos.unidad === "mxn" && v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : String(v))} />
      <Tooltip content={<TooltipCard unidad={datos.unidad} />} />
      {multi && <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />}
    </>
  );

  return (
    <Caja titulo={datos.titulo} w={datos.w}>
      <div className="mt-2" style={{ height: esCategorias ? Math.max(140, data.length * 40 + 20) : 230 }}>
        <ResponsiveContainer width="100%" height="100%">
          {datos.forma === "linea" ? (
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              {ejes}
              {llaves.map((k, i) => (
                <Line key={k} dataKey={k} stroke={colorDe(i)} strokeWidth={2}
                  dot={{ r: 2.5, fill: colorDe(i), strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
              ))}
            </LineChart>
          ) : datos.forma === "area" ? (
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              {ejes}
              {llaves.map((k, i) => (
                <Area key={k} dataKey={k} stroke={colorDe(i)} strokeWidth={2}
                  fill={colorDe(i)} fillOpacity={0.12} isAnimationActive={false} />
              ))}
            </AreaChart>
          ) : esCategorias ? (
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, left: 8, bottom: 0 }} barCategoryGap="30%">
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="etiqueta" tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }} tickLine={false} axisLine={false} width={104} />
              <Tooltip content={<TooltipCard unidad={datos.unidad} />} cursor={{ fill: "hsl(var(--muted))" }} />
              {llaves.map((k, i) => (
                <Bar key={k} dataKey={k} fill={colorDe(i)} radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false}>
                  {!multi && <LabelList dataKey={k} position="right" formatter={f} style={{ fill: "hsl(var(--foreground))", fontSize: 11, fontWeight: 600 }} />}
                </Bar>
              ))}
            </BarChart>
          ) : (
            <BarChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }} barCategoryGap="26%">
              {ejes}
              {llaves.map((k, i) => (
                <Bar key={k} dataKey={k} fill={colorDe(i)} radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false}>
                  {!multi && data.length <= 16 && <LabelList dataKey={k} position="top" formatter={f} style={{ fill: MUTED, fontSize: 10 }} />}
                </Bar>
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </Caja>
  );
}
