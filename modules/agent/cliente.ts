import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";

export type ClienteDetectado = {
  id: string;
  nombre: string;
  tipo: string;
  descuento_pct: number;
};

// Resolve an incoming WhatsApp number to a registered customer via
// customer_phones_all (primary + extras, normalized). WhatsApp sends
// 521477…/52477… while the registry stores 10-digit local numbers, so we
// match on the LAST 10 digits — same rule as crear_cotizacion_whatsapp.
export async function detectarCliente(telefono: string): Promise<ClienteDetectado | null> {
  const norm = telefono.replace(/\D/g, "");
  if (norm.length < 10) return null;
  const last10 = norm.slice(-10);

  try {
    // Two plain queries: the view has no FK, so a PostgREST embed can't join it.
    const { data: hit } = await insforgeAdmin.database
      .from("customer_phones_all")
      .select("customer_id")
      .like("telefono_norm", `%${last10}`)
      .limit(1);
    const customerId = (hit as { customer_id: string }[] | null)?.[0]?.customer_id;
    if (!customerId) return null;

    const { data: c } = await insforgeAdmin.database
      .from("customers")
      .select("id, nombre, tipo, descuento_pct, is_active, is_system")
      .eq("id", customerId)
      .maybeSingle();
    const cust = c as
      | { id: string; nombre: string; tipo: string; descuento_pct: number; is_active: boolean; is_system: boolean }
      | null;
    // is_system = the walk-in "Mostrador" placeholder — not a real person.
    if (!cust?.is_active || cust.is_system) return null;
    return {
      id: cust.id,
      nombre: cust.nombre,
      tipo: cust.tipo,
      descuento_pct: Number(cust.descuento_pct) || 0,
    };
  } catch {
    return null; // detection is best-effort — never break the conversation
  }
}
