import { z } from "zod";

// One set of rules for a customer, run in the form (field-by-field errors
// before anything is sent) and again in the server action (the client can be
// bypassed). Form fields are strings; the helpers below turn them into the
// numbers this schema checks, and garbage into NaN so the schema says why.

const vacio = (v: unknown) => v == null || (typeof v === "string" && v.trim() === "");

/** Optional text: blank → null, otherwise trimmed and checked by `s`. */
const opcional = <T extends z.ZodType>(s: T) =>
  z.preprocess((v) => (vacio(v) ? null : typeof v === "string" ? v.trim() : v), s.nullable()).optional();

const M_DIAS = "Días de crédito: número entero de 1 a 365";
const M_LIMITE = "Límite: monto en pesos, por ejemplo 10000";
const M_NUMERO = "Número de cliente: solo dígitos, mayor a 0";
const M_DESC = "Descuento: número de 0 a 100";

/** A Maps link (https://…) or plain "lat,lng" coordinates. */
function esUbicacion(v: string): boolean {
  if (/^-?\d{1,2}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/.test(v)) return true;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export const customerInputSchema = z.object({
  nombre: z.string().trim().min(1, "Falta el nombre").max(120, "Nombre: máximo 120 caracteres"),
  telefono: z
    .string()
    .trim()
    .refine((v) => {
      const n = v.replace(/\D/g, "").length;
      return n >= 10 && n <= 15;
    }, "Teléfono: de 10 a 15 dígitos"),
  email: opcional(z.email("Correo inválido")),
  descuento_pct: z.number({ error: M_DESC }).min(0, M_DESC).max(100, M_DESC),
  tipo: z.enum(["publico", "mayoreo", "tecnico"], { error: "Tipo inválido" }),
  notas: opcional(z.string().max(500, "Notas: máximo 500 caracteres")),
  credito_dias: z.number({ error: M_DIAS }).int(M_DIAS).min(1, M_DIAS).max(365, M_DIAS).nullable(),
  credito_limite_cents: z.number({ error: M_LIMITE }).int(M_LIMITE).positive(M_LIMITE).nullable(),
  numero: z.number({ error: M_NUMERO }).int(M_NUMERO).positive(M_NUMERO).max(99_999_999, M_NUMERO).nullable().optional(),
  encargado: opcional(z.string().max(120, "Encargado: máximo 120 caracteres")),
  direccion: opcional(z.string().max(200, "Dirección: máximo 200 caracteres")),
  referencias: opcional(z.string().max(200, "Referencias: máximo 200 caracteres")),
  ubicacion: opcional(
    z.string().refine(esUbicacion, "Ubicación: pega el enlace de Maps (https://…) o coordenadas lat,lng"),
  ),
  inventory_id: opcional(z.uuid("Ruta / almacén inválido")),
  forma_pago: z.enum(["contado", "contra_entrega", "credito"], { error: "Forma de pago inválida" }).nullable().optional(),
  bloqueo_motivo: opcional(
    z.string().min(3, "Motivo del bloqueo: al menos 3 letras").max(200, "Motivo: máximo 200 caracteres"),
  ),
});

export type CustomerValido = z.output<typeof customerInputSchema>;

/** Field → first message, for showing each error under its input. */
export function erroresPorCampo(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of error.issues) {
    const k = String(i.path[0] ?? "");
    if (!(k in out)) out[k] = i.message;
  }
  return out;
}

/** "" → null, digits → number, anything else → NaN (the schema rejects it). */
export function entero(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : NaN;
}

/** "0", "12.5", "12,5" → number; blank → 0; garbage → NaN. */
export function decimal(s: string): number {
  const t = s.trim().replace(",", ".");
  if (!t) return 0;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

/** Pesos as typed ("$10,000", "1500.50", "1500,5") → cents; blank → null; garbage → NaN. */
export function pesosACentavos(s: string): number | null {
  let t = s.replace(/[$\s]/g, "");
  if (!t) return null;
  // "10,000" / "1,250.50": commas group thousands. Otherwise a comma is the decimal point.
  t = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(t) ? Math.round(Number(t) * 100) : NaN;
}
