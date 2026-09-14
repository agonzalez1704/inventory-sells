import "server-only";

import { ejecutarConsulta } from "./motor";
import type { WidgetSpec, Rango } from "./spec";
import type { WidgetDatos } from "@/components/dashboards/WidgetsDashboard";

// Resuelve un spec de widget a datos listos para pintar. Compartido por la
// vista y el editor — un solo camino de datos.
export async function resuelveWidget(w: WidgetSpec, rango: Rango, costosVer: boolean): Promise<WidgetDatos> {
  if (w.tipo === "nota") return { tipo: "nota", titulo: w.titulo, w: w.w, texto: w.texto };
  if (w.tipo === "kpi") {
    const r = await ejecutarConsulta(w.consulta, rango, costosVer);
    return { tipo: "kpi", titulo: w.titulo, w: w.w, unidad: r.unidad, valor: r.valor ?? 0, delta: r.delta };
  }
  if (w.tipo === "serie") {
    const series = await Promise.all(w.series.map(async (s) => {
      const r = await ejecutarConsulta(s.consulta, rango, costosVer);
      return { nombre: s.nombre, datos: r.serie ?? [], unidad: r.unidad };
    }));
    return { tipo: "serie", titulo: w.titulo, w: w.w, forma: w.forma, unidad: series[0]?.unidad ?? "numero", series };
  }
  if (w.tipo === "distribucion") {
    const r = await ejecutarConsulta(w.consulta, rango, costosVer);
    return { tipo: "distribucion", titulo: w.titulo, w: w.w, unidad: r.unidad, datos: (r.serie ?? []).slice(0, 5) };
  }
  const r = await ejecutarConsulta(w.consulta, rango, costosVer);
  const nomCol = w.consulta.agrupar !== "ninguno" ? w.consulta.agrupar : "concepto";
  const nomVal = w.consulta.metrica;
  const filas = r.filas ?? (r.serie ?? []).map((s) => ({
    [nomCol]: s.etiqueta,
    [nomVal]: r.unidad === "mxn" ? `$${Math.round(s.valor).toLocaleString("es-MX")}` : s.valor,
  }));
  const columnas = r.columnas ?? [nomCol, nomVal];
  return { tipo: "tabla", titulo: w.titulo, w: w.w, columnas, filas };
}
