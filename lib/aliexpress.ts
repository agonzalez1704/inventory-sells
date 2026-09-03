import "server-only";
import { createHmac } from "node:crypto";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { notifyAdmins } from "@/lib/push";
import { MARCA } from "@/lib/marca";

// AliExpress product lookup for the dropship import: paste a listing URL, get
// name, image and the supplier's price (our COST — the sale price is ours to
// decide on top).
//
// Two routes, best first:
//   1. The DS API (aliexpress.ds.product.get) — exact data, needs the app
//      keys in env AND an OAuth token in config_negocio ("Conectar AliExpress"
//      in Configuración).
//   2. The listing page's own metadata (og:title / og:image + a price regex) —
//      no credentials, but AliExpress bot-walls datacenter IPs at will, so
//      this is best-effort and the price often comes back null.

const API = "https://api-sg.aliexpress.com/sync";

export type ProductoImportado = {
  nombre: string;
  imagenUrl: string | null;
  /** Supplier price in pesos — the product's COST. Null when unreadable. */
  costoPesos: number | null;
  fuente: "api" | "pagina";
};

/** The numeric item id AliExpress URLs carry: /item/1005006123.html etc. */
export function idDeEnlace(url: string): string | null {
  return url.match(/item\/(\d{8,})/)?.[1] ?? url.match(/(\d{10,})/)?.[1] ?? null;
}

// GOP signing: params sorted by key, concatenated key+value, HMAC-SHA256 with
// the app secret, uppercase hex. /sync method-calls sign the bare params;
// /rest endpoints (auth) prefix the concatenation with the API path.
function firmar(params: Record<string, string>, secret: string, path = ""): string {
  const base =
    path +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  return createHmac("sha256", secret).update(base).digest("hex").toUpperCase();
}

async function tokenGuardado(): Promise<string | null> {
  const { data } = await insforgeAdmin.database
    .from("config_negocio")
    .select("aliexpress_token, aliexpress_expira")
    .eq("id", 1)
    .maybeSingle();
  const c = data as { aliexpress_token: string | null; aliexpress_expira: string | null } | null;
  if (!c?.aliexpress_token) return null;
  if (c.aliexpress_expira && new Date(c.aliexpress_expira) <= new Date()) return null;
  return c.aliexpress_token;
}

async function porApi(productId: string): Promise<ProductoImportado | null> {
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;
  if (!appKey || !appSecret) return null;
  const session = await tokenGuardado();
  if (!session) return null;

  const params: Record<string, string> = {
    method: "aliexpress.ds.product.get",
    app_key: appKey,
    session,
    timestamp: String(Date.now()),
    sign_method: "sha256",
    product_id: productId,
    ship_to_country: "MX",
    target_currency: "MXN",
    target_language: "es",
  };
  params.sign = firmar(params, appSecret);

  const res = await fetch(`${API}?${new URLSearchParams(params)}`, {
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const result = (body?.aliexpress_ds_product_get_response as Record<string, unknown> | undefined)
    ?.result as
    | {
        ae_item_base_info_dto?: { subject?: string };
        ae_multimedia_info_dto?: { image_urls?: string };
        ae_item_sku_info_dtos?: {
          ae_item_sku_info_d_t_o?: { offer_sale_price?: string; sku_price?: string }[];
        };
      }
    | undefined;
  if (!result?.ae_item_base_info_dto?.subject) {
    // Endpoint not yet authorized for the app, expired token, bad id… — the
    // caller falls back to the page; log so the real reason is findable.
    console.error("[aliexpress] ds.product.get sin resultado:", JSON.stringify(body).slice(0, 400));
    return null;
  }

  const skus = result.ae_item_sku_info_dtos?.ae_item_sku_info_d_t_o ?? [];
  const precios = skus
    .map((s) => parseFloat(s.offer_sale_price ?? s.sku_price ?? ""))
    .filter((n) => Number.isFinite(n) && n > 0);
  return {
    nombre: result.ae_item_base_info_dto.subject,
    imagenUrl: result.ae_multimedia_info_dto?.image_urls?.split(";")[0] ?? null,
    costoPesos: precios.length ? Math.min(...precios) : null,
    fuente: "api",
  };
}

async function porPagina(url: string): Promise<ProductoImportado | null> {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "accept-language": "es-MX,es;q=0.9",
    },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const html = await res.text();

  const meta = (prop: string) =>
    html.match(new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]+)"`))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content="([^"]+)"[^>]+property="${prop}"`))?.[1] ??
    null;
  const nombre = meta("og:title")?.replace(/\s*[|-]\s*AliExpress.*$/i, "").trim();
  if (!nombre) return null;

  // Price patterns move constantly; a null cost is honest, a wrong one is not.
  const precio =
    html.match(/"salePrice":\{"value":([\d.]+)/)?.[1] ??
    html.match(/"formatedActivityPrice":"[^\d]*([\d,]+\.?\d*)"/)?.[1] ??
    null;

  return {
    nombre,
    imagenUrl: meta("og:image"),
    costoPesos: precio ? parseFloat(precio.replace(/,/g, "")) : null,
    fuente: "pagina",
  };
}

/** Name, image and cost from a supplier listing URL. Throws with a human
 * message when neither route can read it. */
export async function productoDeProveedor(url: string): Promise<ProductoImportado> {
  const limpia = url.trim();
  if (!/^https?:\/\//.test(limpia)) throw new Error("Pega el enlace completo (https://…)");

  const id = idDeEnlace(limpia);
  if (id) {
    const api = await porApi(id).catch(() => null);
    if (api) return api;
  }
  const pagina = await porPagina(limpia);
  if (pagina) return pagina;
  throw new Error(
    "No se pudieron leer los datos del enlace. Conecta AliExpress en Configuración (para usar su API) o captura los datos a mano.",
  );
}

// ---------------------------------------------------------------------------
// OAuth: the token exchange (callback) and the daily refresh (cron) share the
// same signed call and the same persistence.

export type TokensAliExpress = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
  error_msg?: string;
  message?: string;
};

/** Signed POST to a /rest auth endpoint. Adds app_key/timestamp/sign. */
export async function llamarAuthGOP(
  path: "/auth/token/create" | "/auth/token/refresh",
  extra: Record<string, string>,
): Promise<{ ok: boolean; status: number; data: TokensAliExpress | null }> {
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;
  if (!appKey || !appSecret) return { ok: false, status: 0, data: null };

  const params: Record<string, string> = {
    app_key: appKey,
    sign_method: "sha256",
    timestamp: String(Date.now()),
    ...extra,
  };
  params.sign = firmar(params, appSecret, path);

  const res = await fetch(`https://api-sg.aliexpress.com/rest${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = (await res.json().catch(() => null)) as TokensAliExpress | null;
  return { ok: res.ok && !!data?.access_token, status: res.status, data };
}

/** Persist a token response. The refresh endpoint may omit a new
 *  refresh_token — keep the one we have rather than nulling it. */
export async function guardarTokens(data: TokensAliExpress): Promise<string | null> {
  const cambios: Record<string, string> = {
    aliexpress_token: data.access_token!,
    aliexpress_expira: new Date(
      Date.now() + Number(data.expires_in ?? 0) * 1000,
    ).toISOString(),
  };
  if (data.refresh_token) cambios.aliexpress_refresh = data.refresh_token;
  const { error } = await insforgeAdmin.database
    .from("config_negocio")
    .update(cambios)
    .eq("id", 1);
  return error ? (error.message ?? "no se pudo guardar") : null;
}

/**
 * Refresh the stored access token when it is close to dying. Returns what
 * happened so the cron's log line explains itself. A shop that never
 * connected AliExpress (Ruli) reports "sin-conexion" and does nothing.
 */
export async function refrescarTokenAliExpress(): Promise<
  { resultado: "sin-conexion" | "vigente" | "refrescado" } | { resultado: "error"; detalle: string }
> {
  const { data } = await insforgeAdmin.database
    .from("config_negocio")
    .select("aliexpress_refresh, aliexpress_expira")
    .eq("id", 1)
    .maybeSingle();
  const row = data as { aliexpress_refresh: string | null; aliexpress_expira: string | null } | null;
  if (!row?.aliexpress_refresh) return { resultado: "sin-conexion" };

  // The token lives ~48h and the cron runs daily: refresh under 36h left so
  // one missed run still leaves a valid token.
  const restanteMs = new Date(row.aliexpress_expira ?? 0).getTime() - Date.now();
  if (restanteMs > 36 * 60 * 60 * 1000) return { resultado: "vigente" };

  const { ok, status, data: tokens } = await llamarAuthGOP("/auth/token/refresh", {
    refresh_token: row.aliexpress_refresh,
  });
  if (!ok) {
    const detalle = tokens?.error_msg ?? tokens?.message ?? `HTTP ${status}`;
    console.error("[aliexpress] refresh falló:", status, tokens);
    return { resultado: "error", detalle };
  }
  const errGuardar = await guardarTokens(tokens!);
  if (errGuardar) return { resultado: "error", detalle: errGuardar };
  return { resultado: "refrescado" };
}

// ---------------------------------------------------------------------------
// Automatic purchase: a paid order's dropship items get bought on AliExpress
// with the customer's address, no human in the loop. This SPENDS MONEY, so:
// atomic claim first (reclamar_dropship — webhook retries and double clicks
// lose), and every failure path reverts to 'por_pedir' so the manual block in
// /pedidos reappears and an admin gets pinged with the reason.

type OrdenDrop = {
  id: string;
  folio: string;
  nombre: string;
  telefono: string;
  cp: string | null;
  estado: string | null;
  municipio: string | null;
  direccion: string | null;
  referencias: string | null;
};

async function abortar(orden: OrdenDrop, razon: string): Promise<void> {
  await insforgeAdmin.database
    .from("ordenes_web")
    .update({ dropship_estado: "por_pedir" })
    .eq("id", orden.id)
    .eq("dropship_estado", "pidiendo");
  console.error("[aliexpress] compra automática falló:", orden.folio, razon);
  await notifyAdmins("venta", {
    title: "AliExpress: pídelo a mano",
    body: `${orden.folio}: la compra automática falló (${razon}). El bloque manual sigue en Pedidos.`,
    url: "/pedidos",
    tag: `dropship-${orden.id}`,
    icon: MARCA.icono,
  }).catch(() => undefined);
}

/**
 * Place the supplier order for a JUST-PAID web order. Call it fire-and-forget
 * (inside after()) from every path that commits a payment — it claims the
 * order atomically, so calling it twice or on a non-dropship order is a no-op.
 */
export async function pedirDropshipAutomatico(ordenId: string): Promise<void> {
  const { data: gano } = await insforgeAdmin.database.rpc("reclamar_dropship", {
    p_orden_id: ordenId,
  });
  if (!gano) return;

  const { data } = await insforgeAdmin.database
    .from("ordenes_web")
    .select("id, folio, nombre, telefono, cp, estado, municipio, direccion, referencias")
    .eq("id", ordenId)
    .maybeSingle();
  const orden = data as OrdenDrop | null;
  if (!orden) return;

  try {
    const appKey = process.env.ALIEXPRESS_APP_KEY;
    const appSecret = process.env.ALIEXPRESS_APP_SECRET;
    if (!appKey || !appSecret) return abortar(orden, "app sin configurar");
    const { data: tok } = await insforgeAdmin.database
      .from("config_negocio")
      .select("aliexpress_token")
      .eq("id", 1)
      .maybeSingle();
    const session = (tok as { aliexpress_token: string | null } | null)?.aliexpress_token;
    if (!session) return abortar(orden, "sin conexión AliExpress");

    // A pickup+dropship mix has no customer address — nowhere to ship.
    if (!orden.direccion || !orden.cp || !orden.municipio || !orden.estado)
      return abortar(orden, "el pedido no trae dirección de envío");

    const { data: itemsData } = await insforgeAdmin.database
      .from("orden_web_items")
      .select("qty, nombre, products(enlace_proveedor, inventories(es_dropship))")
      .eq("orden_id", ordenId);
    const items = ((itemsData ?? []) as unknown as {
      qty: number;
      nombre: string;
      products: {
        enlace_proveedor: string | null;
        inventories: { es_dropship: boolean | null } | null;
      } | null;
    }[]).filter((i) => i.products?.inventories?.es_dropship);
    if (items.length === 0) return abortar(orden, "sin items dropship");

    const productItems = [];
    for (const i of items) {
      const pid = i.products?.enlace_proveedor ? idDeEnlace(i.products.enlace_proveedor) : null;
      if (!pid) return abortar(orden, `"${i.nombre}" no tiene enlace de proveedor legible`);
      productItems.push({ product_count: i.qty, product_id: Number(pid) });
    }

    const params: Record<string, string> = {
      method: "aliexpress.ds.order.create",
      app_key: appKey,
      session,
      timestamp: String(Date.now()),
      sign_method: "sha256",
      param_place_order_request4_open_api_d_t_o: JSON.stringify({
        logistics_address: {
          address: [orden.direccion, orden.referencias].filter(Boolean).join(", "),
          city: orden.municipio,
          province: orden.estado,
          country: "MX",
          full_name: orden.nombre,
          contact_person: orden.nombre,
          mobile_no: orden.telefono,
          phone_country: "+52",
          zip: orden.cp,
          locale: "es_MX",
        },
        product_items: productItems,
      }),
    };
    params.sign = firmar(params, appSecret);

    const res = await fetch("https://api-sg.aliexpress.com/sync", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const result = (body?.aliexpress_ds_order_create_response as Record<string, unknown> | undefined)
      ?.result as
      | { is_success?: boolean; order_list?: { number?: (number | string)[] }; error_msg?: string; error_code?: string }
      | undefined;
    const numeros = result?.order_list?.number ?? [];
    if (!result?.is_success || numeros.length === 0) {
      const err = (body?.error_response ?? {}) as { msg?: string; code?: string };
      return abortar(
        orden,
        result?.error_msg ?? err.msg ?? err.code ?? "AliExpress no aceptó la orden",
      );
    }

    const ref = numeros.map(String).join(", ");
    await insforgeAdmin.database
      .from("ordenes_web")
      .update({
        dropship_estado: "pedido",
        dropship_ref: ref,
        dropship_pedido_at: new Date().toISOString(),
      })
      .eq("id", ordenId)
      .eq("dropship_estado", "pidiendo");
    await notifyAdmins("venta", {
      title: "Pedido a AliExpress",
      body: `${orden.folio}: orden del proveedor ${ref} creada automáticamente. Verifica el pago en tu cuenta AliExpress.`,
      url: "/pedidos",
      tag: `dropship-${orden.id}`,
      icon: MARCA.icono,
    }).catch(() => undefined);
  } catch (e) {
    await abortar(orden, e instanceof Error ? e.message : "error inesperado");
  }
}

/**
 * Probe whether AliExpress has authorized the DS endpoints for this app:
 * call ds.product.get with a throwaway id and hand back the gateway's error
 * code. Only useful as a diagnostic — the code IS the answer.
 */
export async function estadoEndpointsDS(): Promise<Record<string, unknown>> {
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;
  if (!appKey || !appSecret) return { estado: "app no configurada" };
  const session = await (async () => {
    const { data } = await insforgeAdmin.database
      .from("config_negocio")
      .select("aliexpress_token")
      .eq("id", 1)
      .maybeSingle();
    return (data as { aliexpress_token: string | null } | null)?.aliexpress_token;
  })();
  if (!session) return { estado: "sin token — Conectar AliExpress" };

  const params: Record<string, string> = {
    method: "aliexpress.ds.product.get",
    app_key: appKey,
    session,
    timestamp: String(Date.now()),
    sign_method: "sha256",
    product_id: "1005005953000000",
    ship_to_country: "MX",
    target_currency: "MXN",
    target_language: "es",
  };
  params.sign = firmar(params, appSecret);
  const res = await fetch("https://api-sg.aliexpress.com/sync", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const err = (body?.error_response ?? body) as Record<string, unknown> | null;
  return {
    http: res.status,
    code: err?.code ?? null,
    msg: err?.msg ?? err?.message ?? null,
    respondio_producto: !!body?.aliexpress_ds_product_get_response,
  };
}
