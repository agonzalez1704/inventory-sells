import { requirePagePermiso } from "@/lib/auth/profile";
import { listarConversaciones } from "@/modules/agent/bandeja-actions";
import { BandejaView } from "@/modules/agent/BandejaView";

export const dynamic = "force-dynamic";

export default async function AsesorPage() {
  // This page had no guard at all: any signed-in session could read every
  // customer's WhatsApp conversation. Sellers and admins, as agreed.
  await requirePagePermiso("pos_vender");
  const inicial = await listarConversaciones();

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conversaciones en vivo. Toma el control cuando haga falta; el bot se
          detiene solo.
        </p>
      </div>
      <BandejaView inicial={inicial} />
    </section>
  );
}
