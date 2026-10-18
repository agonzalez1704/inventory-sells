import { requirePagePermiso } from "@/lib/auth/profile";
import { listarSaberes } from "@/modules/agent/saberes-actions";
import { SaberesView } from "@/modules/agent/SaberesView";

export default async function AgentePage() {
  // Teaching the agent is the owner's call.
  await requirePagePermiso("admin_total");
  const saberes = await listarSaberes();
  return <SaberesView saberes={saberes} />;
}
