// Mexico has no DST since 2022, so the store's local day is a fixed UTC-6.
// MX local midnight == 06:00:00 UTC.
const MX_MIDNIGHT_UTC = "06:00:00.000Z";

// Today's date (YYYY-MM-DD) in Mexico City time — the server's default range.
export function mxHoy(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
  }).format(new Date());
}

// [startISO, endISO) in UTC covering the inclusive MX-local date range
// [from, to] (both YYYY-MM-DD). end is the day AFTER `to` at MX midnight.
export function rangoUTC(from: string, to: string): {
  startISO: string;
  endISO: string;
} {
  const startISO = `${from}T${MX_MIDNIGHT_UTC}`;
  const d = new Date(`${to}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const next = d.toISOString().slice(0, 10);
  return { startISO, endISO: `${next}T${MX_MIDNIGHT_UTC}` };
}
