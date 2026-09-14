import { requirePagePermiso } from "@/lib/auth/profile";
import { ChatNegocio } from "@/components/dashboards/ChatNegocio";

export default async function AsistentePage() {
  await requirePagePermiso("ventas_ver");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Asistente</h1>
      <ChatNegocio />
    </div>
  );
}
