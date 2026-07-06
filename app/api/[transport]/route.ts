import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  ventasResumen,
  ventasResumenRango,
  masVendidos,
  masVendidosRango,
  fiadosPendientes,
  estadoInventario,
  buscarProducto,
  listarInventarios,
  corteCaja,
  reporteVentas,
} from "@/modules/analytics/queries";
import { mxHoy } from "@/lib/caja-range";

export const runtime = "nodejs";
export const maxDuration = 60;

const PERIODO = z.enum(["hoy", "7d", "30d"]);
const FECHA = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "fecha en formato YYYY-MM-DD")
  .optional();

function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "salud",
      "Verifica que el conector de Fiable responde (ping rápido, sin datos). Úsalo para confirmar la conexión antes de un reporte.",
      {},
      async () => json({ ok: true, servicio: "fiable-mcp", fecha: mxHoy() }),
    );

    server.tool(
      "ventas_resumen",
      "Resumen de ventas: ingresos, ganancia estimada, número de ventas y ticket promedio. Usa un periodo (hoy/7d/30d) O un rango de fechas desde/hasta (YYYY-MM-DD, México). Para 'semana pasada' o cualquier rango, pasa desde/hasta.",
      { periodo: PERIODO.optional(), desde: FECHA, hasta: FECHA },
      async ({ periodo, desde, hasta }) =>
        json(
          desde
            ? await ventasResumenRango(desde, hasta ?? desde)
            : await ventasResumen(periodo ?? "7d"),
        ),
    );

    server.tool(
      "mas_vendidos",
      "Productos más vendidos por ingreso (top N). Usa un periodo (hoy/7d/30d) O un rango de fechas desde/hasta (YYYY-MM-DD, México).",
      { periodo: PERIODO.optional(), desde: FECHA, hasta: FECHA, limite: z.number().optional() },
      async ({ periodo, desde, hasta, limite }) =>
        json(
          desde
            ? await masVendidosRango(desde, hasta ?? desde, limite ?? 5)
            : await masVendidos(periodo ?? "7d", limite ?? 5),
        ),
    );

    server.tool(
      "fiados_pendientes",
      "Fiados (préstamos) pendientes de cobro: cliente, monto, días y productos.",
      {},
      async () => json(await fiadosPendientes()),
    );

    // --- Reportes financieros (solo admin — este MCP es privado del dueño) ---
    server.tool(
      "corte_caja",
      "Corte de caja de un rango de fechas (solo admin). Ingresos por método, gastos, devoluciones, balance, efectivo en caja, ganancia neta y efectivo etiquetado. Fechas YYYY-MM-DD (México). Si se omiten, usa hoy.",
      { desde: FECHA, hasta: FECHA },
      async ({ desde, hasta }) => {
        const d = desde ?? mxHoy();
        return json(await corteCaja(d, hasta ?? d));
      },
    );

    server.tool(
      "reporte_ventas",
      "Reporte de ventas de un rango de fechas (solo admin): número de ventas, ingresos, ganancia neta, ticket promedio, desglose por método de pago y productos más vendidos. Fechas YYYY-MM-DD (México). Si se omiten, usa hoy.",
      { desde: FECHA, hasta: FECHA, limite: z.number().optional() },
      async ({ desde, hasta, limite }) => {
        const d = desde ?? mxHoy();
        return json(await reporteVentas(d, hasta ?? d, limite ?? 5));
      },
    );

    server.tool(
      "listar_inventarios",
      "Lista los inventarios (bodegas) con su número de productos, unidades y valor de venta.",
      {},
      async () => json(await listarInventarios()),
    );

    server.tool(
      "estado_inventario",
      "Estado del inventario: totales y desglose por inventario (productos, unidades, valor), más listas de bajo stock y agotados (cada uno etiquetado con su inventario).",
      {},
      async () => json(await estadoInventario()),
    );

    server.tool(
      "buscar_producto",
      "Busca productos por SKU o nombre en todos los inventarios. Devuelve inventario, precio, costo, stock, categoría y estado.",
      { q: z.string().describe("SKU o nombre a buscar") },
      async ({ q }) => json(await buscarProducto(q)),
    );
  },
  {},
  { basePath: "/api" },
);

function authorized(req: Request): boolean {
  const expected = process.env.MCP_BEARER_TOKEN;
  if (!expected) return false;
  const header = req.headers.get("authorization") ?? "";
  let token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  // Fallback to a URL token (?token= or ?key=): the claude.ai custom-connector
  // form has no field for a custom Authorization header, so the owner can pass
  // the token in the connector URL instead. Same admin credential either way.
  if (!token) {
    const sp = new URL(req.url).searchParams;
    token = (sp.get("token") ?? sp.get("key") ?? "").trim();
  }
  return token.length > 0 && token === expected;
}

async function guarded(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json", "www-authenticate": "Bearer" },
    });
  }
  return handler(req);
}

export { guarded as GET, guarded as POST, guarded as DELETE };
