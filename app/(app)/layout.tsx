import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ensureProfile } from "@/lib/auth/profile";
import { isAllowedEmail } from "@/lib/auth/allowlist";
import { getNegocioInfo } from "@/modules/config/lib";
import { ConfigPrompt } from "@/modules/config/ConfigPrompt";
import { PushBanner } from "@/components/push-banner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  // Only allow-listed emails may use the app.
  if (!isAllowedEmail(email)) redirect("/sin-acceso");

  const fullName =
    user && (user.firstName || user.lastName)
      ? [user.firstName, user.lastName].filter(Boolean).join(" ")
      : null;

  // First user becomes admin; row is created if missing.
  const profile = await ensureProfile(userId, fullName);
  const isAdmin = profile.role === "admin";

  // Nudge admins to configure the business info (needed by the WhatsApp agent).
  const necesitaConfig = isAdmin && (await getNegocioInfo()) === "";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {necesitaConfig && <ConfigPrompt />}
      {isAdmin && <PushBanner />}
      {children}
    </div>
  );
}
