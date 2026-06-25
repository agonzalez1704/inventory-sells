import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";

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
