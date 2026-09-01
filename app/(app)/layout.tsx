import { Suspense } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { AppShell } from "@/components/app-shell";
import { permisosParaNav } from "@/lib/auth/profile";
import { redirect } from "next/navigation";
import { ensureProfile } from "@/lib/auth/profile";
import { emailTieneAcceso } from "@/lib/auth/allowlist";
import { getNegocioInfo } from "@/modules/config/lib";
import { ConfigPrompt } from "@/modules/config/ConfigPrompt";
import { PushBanner } from "@/components/push-banner";
import { SucursalGate } from "@/modules/sucursales/SucursalGate";
import { VersionWatcher } from "@/components/version-watcher";

/**
 * The auth gate, inside Suspense instead of above it.
 *
 * A layout renders OUTSIDE the page's loading.tsx boundary, so awaiting Clerk
 * here blocked the prerendered shell of every staff route — the exact thing
 * cacheComponents exists to prevent. The gate still runs before any page
 * content streams (children render inside it), and redirect() works fine from
 * within Suspense; what changed is that the frame paints while it checks.
 */
async function Gate({ children }: { children: React.ReactNode }) {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  // Allow-listed (env bootstrap) or invited emails may use the app.
  if (!(await emailTieneAcceso(email))) redirect("/sin-acceso");

  const fullName =
    user && (user.firstName || user.lastName)
      ? [user.firstName, user.lastName].filter(Boolean).join(" ")
      : null;

  // First user becomes admin; invited users get their assigned role.
  const profile = await ensureProfile(userId, fullName, email);
  const isAdmin = profile.role === "admin";

  // Nudge admins to configure the business info (needed by the WhatsApp agent).
  const necesitaConfig = isAdmin && (await getNegocioInfo()) === "";

  return (
    <>
      {necesitaConfig && <ConfigPrompt />}
      {/* Every staff member needs push — sellers get quote assignments +
          unassigned broadcasts, not just admins. The banner self-hides once
          enabled/dismissed/unsupported. */}
      <PushBanner />
      {/* Geo check-in for employees the admin tied to branches; renders
          nothing for everyone else. */}
      <SucursalGate />
      {children}
      {/* Every staff member, not just admins — anyone can hit a stale action. */}
      <VersionWatcher />
    </>
  );
}

// Never awaited in the layout: resolved by the shell's nav under Suspense, so
// the sidebar frame prerenders and only the links wait for Clerk.
async function cargarPermisosNav(): Promise<string[]> {
  const { userId } = await auth();
  return userId ? [...(await permisosParaNav(userId))] : [];
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell permisos={cargarPermisosNav()}>
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Suspense
        fallback={
          <div aria-busy className="animate-pulse space-y-4">
            <div className="h-8 w-56 rounded-lg bg-muted/60" />
            <div className="h-4 w-80 rounded bg-muted/50" />
          </div>
        }
      >
        <Gate>{children}</Gate>
      </Suspense>
    </div>
    </AppShell>
  );
}
