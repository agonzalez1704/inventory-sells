import { createInsForgeServerClient } from "@/lib/insforge/server";
import { AsesorView, type Conversacion } from "@/modules/agent/AsesorView";

export const dynamic = "force-dynamic";

export default async function AsesorPage() {
  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database
    .from("conversaciones")
    .select("numero, motivo, ultimo_texto, handoff_at")
    .eq("estado", "asesor")
    .order("handoff_at", { ascending: false });

  const conversaciones = (data ?? []) as Conversacion[];

  return (
    <>
      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </p>
      )}
      <AsesorView conversaciones={conversaciones} />
    </>
  );
}
