import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { MARCA, type ValorBase } from "@/lib/marca";

// Business info blob injected into the WhatsApp agent. Read with the admin
// client so it works from the webhook (no Clerk session there).
export async function getNegocioInfo(): Promise<string> {
  const { data } = await insforgeAdmin.database
    .from("config_negocio")
    .select("info")
    .eq("id", 1)
    .maybeSingle();
  return ((data as { info?: string } | null)?.info ?? "").trim();
}

// WhatsApp numbers to ping when a conversation needs a human, parsed from the
// free-text config field (comma / space / newline separated). Digits only.
export async function getAsesores(): Promise<string[]> {
  const { data } = await insforgeAdmin.database
    .from("config_negocio")
    .select("asesores")
    .eq("id", 1)
    .maybeSingle();
  return ((data as { asesores?: string } | null)?.asesores ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.replace(/[^\d]/g, ""))
    .filter((s) => s.length >= 8);
}

// Raw asesores string for the config form.
export async function getAsesoresRaw(): Promise<string> {
  const { data } = await insforgeAdmin.database
    .from("config_negocio")
    .select("asesores")
    .eq("id", 1)
    .maybeSingle();
  return ((data as { asesores?: string } | null)?.asesores ?? "").trim();
}

// Whether the inventory header values stock at sale price or at cost.
// NULL in the database means nobody has chosen, so the brand default applies.
export async function getValorBase(): Promise<ValorBase> {
  const { data } = await insforgeAdmin.database
    .from("config_negocio")
    .select("valor_base")
    .eq("id", 1)
    .maybeSingle();
  const v = (data as { valor_base?: string | null } | null)?.valor_base;
  return v === "venta" || v === "costo" ? v : MARCA.valorBase;
}
