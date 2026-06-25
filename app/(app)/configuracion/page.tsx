import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { getNegocioInfo, getAsesoresRaw } from "@/modules/config/lib";
import { ConfigView } from "@/modules/config/ConfigView";

export default async function ConfiguracionPage() {
  const { userId } = await auth();
  const profile = userId ? await getProfile(userId) : null;
  const isAdmin = profile?.role === "admin";
  const [info, asesores] = await Promise.all([
    getNegocioInfo(),
    getAsesoresRaw(),
  ]);

  return <ConfigView info={info} asesores={asesores} isAdmin={isAdmin} />;
}
