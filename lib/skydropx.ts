import "server-only";

// Skydropx Pro quoting. Verified empirically against the live API — their
// developer docs (developers.skydropx.com) were down, and docs.skydropx.com
// documents a DIFFERENT, legacy v1 API ("Authorization: Token token=…") that
// rejects Pro credentials with 401.
//
// Pro flow:
//   1. POST /api/v1/oauth/token  {client_id, client_secret, grant_type} -> access_token (2h)
//   2. POST /api/v1/quotations   -> 201 with is_completed:false, rates "pending"
//   3. GET  /api/v1/quotations/{id} until rates arrive  (quoting is ASYNC)
// Amounts come back in MXN PESOS as strings -> converted to centavos here.

const BASE = "https://pro.skydropx.com/api/v1";

export type Parcel = { weight: number; height: number; width: number; length: number };

/** Each screen/battery is ~100 g. */
export const GRAMOS_POR_PIEZA = 100;

// Carriers bill a 1 kg minimum and the API takes whole KG, so a 1–10 piece
// order rides the same 1 kg rate — shipping doesn't scale with basket size.
export function paqueteParaPiezas(piezas: number): Parcel {
  const kg = Math.max(1, Math.ceil((Math.max(1, piezas) * GRAMOS_POR_PIEZA) / 1000));
  return { weight: kg, height: 10, width: 25, length: 30 };
}

export type Tarifa = {
  proveedor: string;
  servicio: string;
  dias: number | null;
  totalCents: number;
};

export type Destino = {
  cp: string;
  estado: string; // area_level1
  municipio: string; // area_level2
  colonia?: string; // area_level3
};

let cache: { token: string; exp: number } | null = null;

async function token(): Promise<string> {
  if (cache && Date.now() < cache.exp) return cache.token;
  const client_id = process.env.SKYDROPX_API_KEY;
  const client_secret = process.env.SKYDROPX_SECRET_KEY;
  if (!client_id || !client_secret) throw new Error("Skydropx no configurado");

  const r = await fetch(`${BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id, client_secret, grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`skydropx auth ${r.status}`);
  const j = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error("skydropx: sin access_token");
  // Renew a minute early rather than race the expiry.
  cache = { token: j.access_token, exp: Date.now() + ((j.expires_in ?? 7200) - 60) * 1000 };
  return j.access_token;
}

type RawRate = {
  success?: boolean;
  total?: string | number | null;
  days?: number | null;
  provider_display_name?: string;
  provider_service_name?: string;
};
type RawQuote = { id?: string; is_completed?: boolean; rates?: RawRate[] };

function mapRates(rates: RawRate[]): Tarifa[] {
  return rates
    .filter((r) => r.success && r.total != null)
    .map((r) => ({
      proveedor: r.provider_display_name ?? "—",
      servicio: r.provider_service_name ?? "—",
      dias: r.days ?? null,
      totalCents: Math.round(parseFloat(String(r.total)) * 100),
    }))
    .filter((r) => Number.isFinite(r.totalCents) && r.totalCents > 0)
    .sort((a, b) => a.totalCents - b.totalCents);
}

export async function cotizarEnvio(
  destino: Destino,
  parcel: Parcel = paqueteParaPiezas(1),
): Promise<Tarifa[]> {
  if (!/^\d{5}$/.test(destino.cp)) throw new Error("Código postal inválido");
  const zipFrom = process.env.SKYDROPX_ZIP_FROM;
  if (!zipFrom) throw new Error("SKYDROPX_ZIP_FROM no configurado");

  const t = await token();
  const headers = { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };

  const create = await fetch(`${BASE}/quotations`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      quotation: {
        address_from: {
          country_code: "mx",
          postal_code: zipFrom,
          area_level1: "Guanajuato",
          area_level2: "Leon",
          area_level3: "Centro",
        },
        address_to: {
          country_code: "mx",
          postal_code: destino.cp,
          area_level1: destino.estado,
          area_level2: destino.municipio,
          area_level3: destino.colonia ?? "Centro",
        },
        parcel,
        requested_carriers: [],
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!create.ok) throw new Error(`skydropx quote ${create.status}`);
  const q = (await create.json()) as RawQuote;
  if (!q.id) throw new Error("skydropx: cotización sin id");

  // Rates arrive asynchronously — poll until any carrier answers.
  for (let i = 0; i < 10; i++) {
    const ready = mapRates(q.rates ?? []);
    if (ready.length) return ready;

    await new Promise((s) => setTimeout(s, 1500));
    const g = await fetch(`${BASE}/quotations/${q.id}`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!g.ok) continue;
    const poll = (await g.json()) as RawQuote;
    const rates = mapRates(poll.rates ?? []);
    if (rates.length) return rates;
    if (poll.is_completed) return rates; // completed with none
  }
  return [];
}

/** Cheapest rate for a basket — what we'd charge the customer. */
export async function tarifaMasBarata(
  destino: Destino,
  piezas: number,
): Promise<Tarifa | null> {
  const rates = await cotizarEnvio(destino, paqueteParaPiezas(piezas));
  return rates[0] ?? null;
}
