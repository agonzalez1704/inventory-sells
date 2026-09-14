import { streamText, tool, stepCountIs, convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { assertPermiso, permisosDe } from "@/lib/auth/profile";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { MARCA } from "@/lib/marca";
import {
  ventasResumen, masVendidos, fiadosPendientes, adelantosPendientes,
  estadoInventario, buscarProducto, corteCaja, reporteVentas, type Periodo,
} from "@/modules/analytics/queries";
import { dashboardSpecSchema, operacionSchema, aplicarOperaciones } from "@/modules/dashboards/spec";

// Asistente del negocio (port del patron de e-commerce): chat con las
// herramientas de analytics existentes, graficas nativas y dashboards
// generativos. Escrituras: solo specs de dashboard validados — nunca SQL.

export const maxDuration = 60;

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY! });
const MODEL = process.env.OPENROUTER_CHAT_MODEL ?? "anthropic/claude-sonnet-4.6";

const periodo = z.enum(["hoy", "7d", "30d"]);
const DB = insforgeAdmin.database;

export async function POST(req: Request) {
  let permisos: Set<string>;
  try {
    await assertPermiso("ventas_ver");
    permisos = await permisosDe();
  } catch {
    return new Response("No autorizado", { status: 403 });
  }
  const costosVer = permisos.has("costos_ver") || permisos.has("admin_total");

  const { messages, dashboardId }: { messages: UIMessage[]; dashboardId?: string } = await req.json();

  let contextoDashboard = "";
  if (dashboardId) {
    const { data } = await DB.from("dashboards").select("spec, nombre").eq("id", dashboardId).maybeSingle();
    if (data) {
      contextoDashboard = `\nESTAS EDITANDO el dashboard "${(data as { nombre: string }).nombre}" (id ${dashboardId}). Spec actual (widgets con indice desde 0):\n${JSON.stringify((data as { spec: unknown }).spec)}\nPara cualquier cambio usa parcharDashboard con operaciones (agregar/quitar/reemplazar/configurar). Si llega un mensaje con [widget N], opera sobre ese indice. Tras parchar, confirma en una frase que cambio.`;
    }
  }

  const result = streamText({
    model: openrouter(MODEL),
    system: `Eres el asistente interno de ${MARCA.nombre}, un punto de venta en México. Hoy es ${new Date().toLocaleDateString("es-MX", { dateStyle: "long", timeZone: "America/Mexico_City" })}.
Respondes en español, directo y con números concretos. Usa las herramientas para TODO dato del negocio — nunca inventes cifras. Montos en MXN.
${costosVer ? "" : "Este usuario NO tiene permiso de costos: no uses la métrica ganancia ni reveles costos."}
Cuando pidan gráficas usa mostrarGrafica (se pinta dentro del chat); no ofrezcas PNGs ni archivos.
Cuando pidan un DASHBOARD o reporte completo usa crearDashboard: compones el spec con widgets (kpi con comparar para deltas, serie linea/barras/area, distribucion, tabla, nota) y consultas del DSL (fuente ventas/fiados/gastos/cotizaciones + metrica + agrupar). Grid de 12 columnas: kpis w=3, graficas w=6, anchas w=12. Queda guardado y VIVO.${contextoDashboard}`,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(8),
    tools: {
      ventasResumen: tool({
        description: "Ventas cobradas del periodo: cuantas, ingresos, ticket y ganancia.",
        inputSchema: z.object({ periodo }),
        execute: async ({ periodo: p }) => {
          const r = await ventasResumen(p as Periodo);
          return costosVer ? r : { ...r, ganancia_estimada_mxn: undefined };
        },
      }),
      masVendidos: tool({
        description: "Productos mas vendidos del periodo.",
        inputSchema: z.object({ periodo, limite: z.number().int().min(1).max(20).optional() }),
        execute: async ({ periodo: p, limite }) => masVendidos(p as Periodo, limite ?? 5),
      }),
      corteCaja: tool({
        description: "Corte de caja de un dia o rango (YYYY-MM-DD): ingresos, gastos, devoluciones, balance y efectivo.",
        inputSchema: z.object({ desde: z.string(), hasta: z.string() }),
        execute: async ({ desde, hasta }) => {
          const r = await corteCaja(desde, hasta);
          return costosVer ? r : { ...r, ganancia_neta_mxn: undefined };
        },
      }),
      fiadosPendientes: tool({
        description: "Fiados pendientes con cliente, saldo y dias.",
        inputSchema: z.object({}),
        execute: async () => fiadosPendientes(),
      }),
      adelantosPendientes: tool({
        description: "Adelantos/apartados pendientes de entregar.",
        inputSchema: z.object({}),
        execute: async () => adelantosPendientes(),
      }),
      estadoInventario: tool({
        description: "Resumen del inventario y productos agotados o bajos.",
        inputSchema: z.object({}),
        execute: async () => estadoInventario(),
      }),
      buscarProducto: tool({
        description: "Busca productos por nombre, SKU o compatibilidad.",
        inputSchema: z.object({ q: z.string().min(2) }),
        execute: async ({ q }) => buscarProducto(q),
      }),
      reporteVentas: tool({
        description: "Reporte de ventas de un rango de fechas (YYYY-MM-DD): totales y top productos.",
        inputSchema: z.object({ desde: z.string(), hasta: z.string(), limite: z.number().int().min(1).max(20).optional() }),
        execute: async ({ desde, hasta, limite }) => reporteVentas(desde, hasta, limite ?? 5),
      }),
      mostrarGrafica: tool({
        description: "Pinta una grafica DENTRO del chat. Usala siempre que pidan graficas. series = etiqueta + valor; unidad 'mxn' formatea pesos.",
        inputSchema: z.object({
          titulo: z.string(),
          unidad: z.enum(["mxn", "numero"]).default("numero"),
          tipo: z.enum(["barras", "linea"]).default("barras"),
          series: z.array(z.object({ etiqueta: z.string(), valor: z.number() })).min(1).max(31),
        }),
        execute: async (input) => input,
      }),
      crearDashboard: tool({
        description: "Crea un dashboard guardado y vivo a partir de un spec declarativo. Devuelve la URL.",
        inputSchema: z.object({ spec: dashboardSpecSchema }),
        execute: async ({ spec }) => {
          const { data, error } = await DB.from("dashboards")
            .insert({ nombre: spec.titulo, spec })
            .select("id")
            .single();
          if (error || !data) return { ok: false, error: error?.message ?? "no se pudo guardar" };
          return { ok: true, url: `/dashboards/${(data as { id: string }).id}`, nombre: spec.titulo };
        },
      }),
      ...(dashboardId ? {
        parcharDashboard: tool({
          description: "Aplica cambios al dashboard en edicion: agregar/quitar/reemplazar widgets (por indice) o configurar titulo/rango. El resultado completo se valida; si algo falla nada se aplica.",
          inputSchema: z.object({ operaciones: z.array(operacionSchema).min(1).max(10) }),
          execute: async ({ operaciones }) => {
            const { data } = await DB.from("dashboards").select("spec").eq("id", dashboardId).maybeSingle();
            if (!data) return { ok: false, error: "dashboard no encontrado" };
            const actual = dashboardSpecSchema.parse((data as { spec: unknown }).spec);
            let nuevo;
            try {
              nuevo = aplicarOperaciones(actual, operaciones);
            } catch (e) {
              return { ok: false, error: e instanceof Error ? e.message : "operacion invalida" };
            }
            await DB.from("dashboards_versiones").insert({ dashboard_id: dashboardId, spec: actual });
            const { error } = await DB.from("dashboards")
              .update({ spec: nuevo, nombre: nuevo.titulo, updated_at: new Date().toISOString() })
              .eq("id", dashboardId);
            if (error) return { ok: false, error: error.message };
            return { ok: true, widgets: nuevo.widgets.length };
          },
        }),
      } : {}),
    },
  });

  return result.toUIMessageStreamResponse();
}
