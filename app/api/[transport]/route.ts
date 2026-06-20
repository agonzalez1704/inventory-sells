import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  ventasResumen,
  masVendidos,
  fiadosPendientes,
  estadoInventario,
  buscarProducto,
} from "@/modules/analytics/queries";

export const runtime = "nodejs";
export const maxDuration = 60;

const PERIODO = z.enum(["hoy", "7d", "30d"]);

function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "ventas_resumen",
      "Resumen de ventas en un periodo: ingresos, ganancia estimada, número de ventas y ticket promedio.",
      { periodo: PERIODO },
      async ({ periodo }) => json(await ventasResumen(periodo)),
    );

    server.tool(
      "mas_vendidos",
      "Productos más vendidos por ingreso en un periodo (top N).",
      { periodo: PERIODO, limite: z.number().optional() },
      async ({ periodo, limite }) => json(await masVendidos(periodo, limite ?? 5)),
    );

    server.tool(
      "fiados_pendientes",
      "Fiados (préstamos) pendientes de cobro: cliente, monto, días y productos.",
      {},
      async () => json(await fiadosPendientes()),
    );

    server.tool(
      "estado_inventario",
      "Estado del inventario: total de productos, unidades, valor de venta, y listas de bajo stock y agotados.",
      {},
      async () => json(await estadoInventario()),
    );

    server.tool(
      "buscar_producto",
      "Busca productos por SKU o nombre. Devuelve precio, costo, stock, categoría y estado.",
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
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
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
