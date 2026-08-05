// Who sent this WhatsApp message — the pure half (no DB, no server-only, so
// scripts/test-identidad.ts can replay payloads against it directly).
//
// The phone number used to be the answer. Meta now issues every user a
// business-scoped user ID (BSUID) and REMOVES the phone number once they adopt
// a @username — not blanked, absent from the payload. So a sender is whatever
// subset of these identifiers arrives.

export type Remitente = {
  clave: string; // conversation key: what wa_mensajes/cotizaciones join on
  telefono: string; // "" once Meta stops sending it — an address, not an id
  bsuid: string;
  username: string;
};

export type EventoIdentidad = {
  contact?: { id?: string | null } | null;
  conversation?: {
    business_scoped_user_id?: string | null;
    parent_business_scoped_user_id?: string | null;
    username?: string | null;
    phone_number?: string | null;
  } | null;
};

// Meta rejects a BSUID that isn't whole: country code, period, optional ENT
// segment for parent BSUIDs, then the id. Checking here also stops one from
// being written into a phone column, which fails silently instead of loudly.
const BSUID = /^[A-Za-z]{2}\.(?:ENT\.)?[A-Za-z0-9]{1,128}$/;

/**
 * Pull the sender's identifiers out of a batch of Kapso events.
 *
 * Kapso puts them on both the contact and the conversation; take the first
 * event that carries each, since a buffered batch is one sender but not every
 * event necessarily repeats every field.
 */
export function identificadores(eventos: EventoIdentidad[]) {
  const primero = (f: (e: EventoIdentidad) => string | null | undefined): string =>
    String(eventos.map(f).find((v) => v) ?? "").trim();

  const bsuid = primero(
    (e) =>
      e.conversation?.business_scoped_user_id ??
      e.conversation?.parent_business_scoped_user_id,
  );
  return {
    contactId: primero((e) => e.contact?.id),
    // A malformed BSUID is worse than none: it would key a real person on
    // garbage. Drop it and let the phone number carry the message.
    bsuid: BSUID.test(bsuid) ? bsuid : "",
    username: primero((e) => e.conversation?.username),
    telefono: primero((e) => e.conversation?.phone_number),
  };
}

/** How to refer to this person in a message to staff, best identifier first. */
export function etiqueta(r: Remitente): string {
  if (r.telefono) return r.telefono;
  if (r.username) return `@${r.username.replace(/^@/, "")}`;
  return r.bsuid || r.clave;
}
