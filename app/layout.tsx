import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { Toaster } from "sonner";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { MARCA, brandCssVars } from "@/lib/marca";
import { AppShell } from "@/components/app-shell";
import { getPermisos } from "@/lib/auth/profile";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: MARCA.nombre,
  description: MARCA.descripcion,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: MARCA.corto, statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Role-aware nav: pass the signed-in user's permisos so the shell hides links
  // their role doesn't grant. Cheap indexed lookup; skipped when signed out.
  const { userId } = await auth();
  const permisos = userId ? [...(await getPermisos(userId))] : [];

  return (
    <html lang="es-MX" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        {/* Brand palette for this deploy; overrides the defaults in globals.css. */}
        <style dangerouslySetInnerHTML={{ __html: brandCssVars() }} />
        {/* Set the theme class before paint — no flash of the wrong theme.
            Stored choice wins, else the OS preference. Customer-facing pages
            (storefront + shareable quote) stay light and on-brand. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var p=location.pathname;if(p.indexOf('/tienda')===0||p==='/cotizacion')return;var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();",
          }}
        />
        {/* Search and filters live in the URL (nuqs), so a refresh — or the
            reload a new deploy forces — doesn't wipe what the seller typed. */}
        <NuqsAdapter>
          <ClerkProvider>
            <AppShell permisos={permisos}>{children}</AppShell>
            <Toaster
              position="top-right"
              richColors
              toastOptions={{ className: "font-sans" }}
            />
          </ClerkProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
