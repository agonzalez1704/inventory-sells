// Kept out of actions.ts: a "use server" file may only export async functions.

/** Columns every customer list reads. One literal so the SDK can type it. */
export const CUSTOMER_COLS =
  "id, numero, nombre, telefono, email, descuento_pct, tipo, notas, credito_dias, credito_limite_cents, encargado, direccion, referencias, ubicacion, inventory_id, forma_pago, bloqueo_motivo, is_active, is_system, created_at, customer_phones(id, telefono, etiqueta)";
