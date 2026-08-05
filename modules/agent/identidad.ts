import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { identificadores, type EventoIdentidad, type Remitente } from "@/lib/wa-identidad";

export { etiqueta } from "@/lib/wa-identidad";
export type { EventoIdentidad, Remitente } from "@/lib/wa-identidad";

/**
 * Resolve an inbound message's identifiers to a stable conversation key,
 * recording whatever it taught us about the sender.
 *
 * The matching order (contact_id → bsuid → telefono) lives in the SQL, where
 * it can run under one transaction — see the wa_identidades migration.
 *
 * Returns null only when the payload identified nobody at all. The caller must
 * not invent a key: a wrong one attaches this conversation to somebody else's
 * history.
 */
export async function resolverRemitente(
  eventos: EventoIdentidad[],
): Promise<Remitente | null> {
  const { contactId, bsuid, username, telefono } = identificadores(eventos);
  if (!contactId && !bsuid && !telefono) return null;

  const { data, error } = await insforgeAdmin.database.rpc("wa_identidad_resolver", {
    p_contact_id: contactId || null,
    p_bsuid: bsuid || null,
    p_telefono: telefono || null,
    p_username: username || null,
  });
  if (error) throw new Error(error.message ?? "No se pudo resolver el remitente");

  const clave = String((Array.isArray(data) ? data[0] : data) ?? "").trim();
  if (!clave) return null;
  return { clave, telefono, bsuid, username };
}
