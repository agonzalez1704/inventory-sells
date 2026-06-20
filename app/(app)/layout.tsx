import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ensureProfile } from "@/lib/auth/profile";
import { isAllowedEmail } from "@/lib/auth/allowlist";

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
  await ensureProfile(userId, fullName);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</div>
  );
}
