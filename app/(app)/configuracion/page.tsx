import { auth } from "@clerk/nextjs/server";
import { getProfile } from "@/lib/auth/profile";
import { getNegocioInfo } from "@/modules/config/lib";
import { ConfigView } from "@/modules/config/ConfigView";

export default async function ConfiguracionPage() {
  const { userId } = await auth();
  const profile = userId ? await getProfile(userId) : null;
  const isAdmin = profile?.role === "admin";
  const info = await getNegocioInfo();

  return <ConfigView info={info} isAdmin={isAdmin} />;
}
