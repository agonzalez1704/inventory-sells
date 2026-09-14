import { z } from "zod";

// ============================================================
// Dashboards generativos — contrato modelo <-> render (port de e-commerce,
// adaptado al POS). Dos capas:
//  1. DSL de consulta ACOTADO: fuente + metrica + agrupar + rango + comparar.
//     El motor lo traduce a consultas parametrizadas — el modelo jamas toca SQL.
//  2. Primitivas de widget: kpi, serie (multi), distribucion, tabla, nota.
// ============================================================

export const RANGOS = { hoy: 1, "7d": 7, "30d": 30, "90d": 90 } as const;
export type Rango = keyof typeof RANGOS;

export const consultaSchema = z.object({
  fuente: z.enum(["ventas", "fiados", "gastos", "cotizaciones"]),
  // ganancia exige el permiso costos_ver — el motor lo verifica por peticion
  metrica: z.enum(["ingresos", "ventas", "unidades", "ticket", "ganancia", "monto", "conteo"]).default("ingresos"),
  agrupar: z.enum(["ninguno", "dia", "semana", "producto", "categoria", "etiqueta", "metodo", "vendedor", "cliente", "estado"]).default("ninguno"),
  rango: z.enum(["hoy", "7d", "30d", "90d"]).optional(),
  comparar: z.enum(["periodo_anterior"]).optional(),
  limite: z.number().int().min(1).max(31).optional(),
});
export type ConsultaDSL = z.infer<typeof consultaSchema>;

export const widgetSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("kpi"), titulo: z.string(), w: z.number().int().min(2).max(12).default(3), consulta: consultaSchema }),
  z.object({
    tipo: z.literal("serie"), titulo: z.string(), w: z.number().int().min(4).max(12).default(6),
    forma: z.enum(["linea", "barras", "area"]).default("barras"),
    series: z.array(z.object({ nombre: z.string(), consulta: consultaSchema })).min(1).max(4),
  }),
  z.object({ tipo: z.literal("distribucion"), titulo: z.string(), w: z.number().int().min(3).max(6).default(4), consulta: consultaSchema }),
  z.object({ tipo: z.literal("tabla"), titulo: z.string(), w: z.number().int().min(6).max(12).default(12), consulta: consultaSchema }),
  z.object({ tipo: z.literal("nota"), titulo: z.string().optional(), w: z.number().int().min(3).max(12).default(3), texto: z.string() }),
]);
export type WidgetSpec = z.infer<typeof widgetSchema>;

export const dashboardSpecSchema = z.object({
  titulo: z.string(),
  descripcion: z.string().optional(),
  rango: z.enum(["hoy", "7d", "30d", "90d"]).default("30d"),
  widgets: z.array(widgetSchema).min(1).max(14),
});
export type DashboardSpec = z.infer<typeof dashboardSpecSchema>;

// ---- parcheo ----------------------------------------------------------------

export const operacionSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("agregar"), widget: widgetSchema, posicion: z.number().int().min(0).optional() }),
  z.object({ op: z.literal("quitar"), indice: z.number().int().min(0) }),
  z.object({ op: z.literal("reemplazar"), indice: z.number().int().min(0), widget: widgetSchema }),
  z.object({ op: z.literal("configurar"), titulo: z.string().optional(), descripcion: z.string().optional(), rango: z.enum(["hoy", "7d", "30d", "90d"]).optional() }),
]);
export type Operacion = z.infer<typeof operacionSchema>;

export function aplicarOperaciones(spec: DashboardSpec, ops: Operacion[]): DashboardSpec {
  const widgets = [...spec.widgets];
  let meta = { titulo: spec.titulo, descripcion: spec.descripcion, rango: spec.rango };
  for (const o of ops) {
    if (o.op === "agregar") widgets.splice(o.posicion ?? widgets.length, 0, o.widget);
    else if (o.op === "quitar") {
      if (o.indice >= widgets.length) throw new Error(`No existe el widget ${o.indice}`);
      widgets.splice(o.indice, 1);
    } else if (o.op === "reemplazar") {
      if (o.indice >= widgets.length) throw new Error(`No existe el widget ${o.indice}`);
      widgets[o.indice] = o.widget;
    } else {
      meta = { titulo: o.titulo ?? meta.titulo, descripcion: o.descripcion ?? meta.descripcion, rango: o.rango ?? meta.rango };
    }
  }
  // el resultado COMPLETO se revalida: un parche no puede dejar un spec invalido
  return dashboardSpecSchema.parse({ ...meta, widgets });
}
