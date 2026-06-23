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
