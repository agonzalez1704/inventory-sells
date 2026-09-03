import "server-only";
import { createHmac } from "node:crypto";
import { insforgeAdmin } from "@/lib/insforge/admin";

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
