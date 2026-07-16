import "server-only";

// Skydropx quotation wrapper. Contract verified against docs.skydropx.com:
//   POST /v1/quotations  { zip_from, zip_to, parcel{weight KG, h/w/l CM}, carriers? }
//   -> [{ provider, service_level_name, amount_local, days, out_of_area_*, total_pricing }]
//
// NOTE: Skydropx returns amounts in MXN PESOS, not centavos — everything else in
// this app is centavos, so rates are converted at the boundary.

const BASE = "https://api.skydropx.com/v1";

export type Parcel = {
  weight: number; // KG
  height: number; // CM
  width: number; // CM
  length: number; // CM
};

// Screens/batteries ship in a small padded box. Placeholder until the real
// package is measured — quotes are only as good as this.
export const PAQUETE_DEFAULT: Parcel = { weight: 1, height: 10, width: 25, length: 30 };

export type Tarifa = {
  proveedor: string;
  servicio: string;
  dias: number;
  /** What to charge the customer, in centavos (amount_local + out_of_area). */
  totalCents: number;
  fueraDeArea: boolean;
};

type RawRate = {
  provider?: string;
  service_level_name?: string;
  amount_local?: number;
  days?: number;
  out_of_area_service?: boolean;
  out_of_area_pricing?: number;
  total_pricing?: number;
};

export async function cotizarEnvio(
  zipTo: string,
  parcel: Parcel = PAQUETE_DEFAULT,
): Promise<Tarifa[]> {
  const key = process.env.SKYDROPX_API_KEY;
  const zipFrom = process.env.SKYDROPX_ZIP_FROM;
  if (!key || !zipFrom) throw new Error("Skydropx no configurado");
  if (!/^\d{5}$/.test(zipTo)) throw new Error("Código postal inválido");

  const res = await fetch(`${BASE}/quotations`, {
    method: "POST",
    headers: {
      Authorization: `Token token=${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      zip_from: zipFrom,
      zip_to: zipTo,
      parcel: {
        weight: String(parcel.weight),
        height: String(parcel.height),
        width: String(parcel.width),
        length: String(parcel.length),
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`skydropx ${res.status}`);
  }
  const raw = (await res.json()) as RawRate[] | { data?: RawRate[] };
  const list = Array.isArray(raw) ? raw : (raw.data ?? []);

  return list
    .filter((r) => typeof r.total_pricing === "number" || typeof r.amount_local === "number")
    .map((r) => {
      // total_pricing already sums the out-of-area surcharge; fall back to the
      // parts if a carrier omits it, so we never undercharge ourselves.
      const pesos =
        r.total_pricing ?? (r.amount_local ?? 0) + (r.out_of_area_pricing ?? 0);
      return {
        proveedor: r.provider ?? "—",
        servicio: r.service_level_name ?? "—",
        dias: r.days ?? 0,
        totalCents: Math.round(pesos * 100),
        fueraDeArea: Boolean(r.out_of_area_service),
      };
    })
    .sort((a, b) => a.totalCents - b.totalCents);
}
