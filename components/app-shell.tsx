"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, UserButton, SignInButton, SignUpButton } from "@clerk/nextjs";
import {
  Boxes,
  ShoppingCart,
  HandCoins,
  BarChart3,
  Settings,
  Headset,
  Calculator,
  Wallet,
  Users,
  Package,
  ScanBarcode,
  ShieldCheck,
  FileText,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Permiso } from "@/lib/permissions";
import { Logo } from "@/components/logo";
import { AsesorNavBadge } from "@/components/asesor-nav-badge";

// Nav grouped into sections — a flat list of 12 got unwieldy in a top bar, and a
// sidebar has the vertical room to label the groups. Each link names the permiso
// that reveals it (admin_total always sees everything); links/groups the user's
// role doesn't grant are hidden.
const GRUPOS: {
  label: string;
  links: { href: string; label: string; icon: typeof Boxes; permiso?: Permiso }[];
}[] = [
  {
    label: "Operación",
    links: [
      { href: "/pos", label: "POS", icon: ScanBarcode, permiso: "pos_vender" },
      { href: "/ventas", label: "Ventas", icon: ShoppingCart, permiso: "pos_vender" },
      { href: "/cotizaciones", label: "Cotizaciones", icon: FileText, permiso: "cotizar" },
      { href: "/pedidos", label: "Pedidos", icon: Package, permiso: "surtir" },
      { href: "/fiados", label: "Notas de crédito", icon: HandCoins, permiso: "pos_vender" },
      { href: "/adelantos", label: "Adelantos", icon: Wallet, permiso: "pos_vender" },
      { href: "/asesor", label: "Asesor", icon: Headset, permiso: "pos_vender" },
    ],
  },
  {
    label: "Catálogo",
    links: [
      { href: "/inventario", label: "Inventario", icon: Boxes, permiso: "inventario_ver" },
      { href: "/clientes", label: "Clientes", icon: Users, permiso: "pos_vender" },
    ],
  },
  {
    label: "Finanzas",
    links: [
      { href: "/caja", label: "Caja", icon: Calculator, permiso: "corte_ver" },
      { href: "/reportes", label: "Reportes", icon: BarChart3, permiso: "corte_ver" },
    ],
  },
  {
    label: "Sistema",
    links: [
      { href: "/usuarios", label: "Usuarios", icon: ShieldCheck, permiso: "usuarios_gestionar" },
      // No permiso: everyone needs their own device push + notification prefs.
      { href: "/configuracion", label: "Configuración", icon: Settings },
    ],
  },
];

function NavList({ permisos, onNavigate }: { permisos: Set<string>; onNavigate?: () => void }) {
  const pathname = usePathname();
  const puede = (p?: Permiso) => !p || permisos.has("admin_total") || permisos.has(p);
  const grupos = GRUPOS.map((g) => ({ ...g, links: g.links.filter((l) => puede(l.permiso)) })).filter(
    (g) => g.links.length > 0,
  );
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {grupos.map((g) => (
        <div key={g.label}>
          <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {g.label}
          </p>
          <div className="space-y-0.5">
            {g.links.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {href === "/asesor" && <AsesorNavBadge />}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function AppShell({
  children,
  permisos = [],
}: {
  children: React.ReactNode;
  permisos?: string[];
}) {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const permSet = new Set(permisos);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Public, customer-facing pages carry their own branding and must never show
  // the app chrome or sign-in prompts: the storefront and the shareable quote.
  if (pathname.startsWith("/tienda") || pathname === "/cotizacion") return <>{children}</>;

  return (
    <>
      {isSignedIn ? (
        <>
          {/* Desktop sidebar — fixed, so main just pads left to clear it. */}
          <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-border bg-background lg:flex">
            <div className="brand-gradient h-[2px] w-full" />
            <div className="flex h-[52px] shrink-0 items-center border-b border-border px-4">
              <Link href="/" aria-label="Fiable — inicio">
                <Logo className="h-6 w-auto text-foreground" />
              </Link>
            </div>
            <NavList permisos={permSet} />
            <div className="shrink-0 border-t border-border p-3">
              <UserButton showName />
            </div>
          </aside>

          {/* Mobile top bar */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur lg:hidden">
            <div className="brand-gradient absolute inset-x-0 top-0 h-[2px]" />
            <button
              onClick={() => setOpen(true)}
              aria-label="Abrir menú"
              className="cursor-pointer rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Link href="/" className="flex items-center" aria-label="Fiable — inicio">
              <Logo className="h-6 w-auto text-foreground" />
            </Link>
            <div className="ml-auto">
              <UserButton />
            </div>
          </header>

          {/* Mobile drawer */}
          {open && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <button
                aria-label="Cerrar menú"
                onClick={() => setOpen(false)}
                className="absolute inset-0 cursor-default bg-slate-900/40 backdrop-blur-sm"
              />
              <div className="absolute inset-y-0 left-0 flex w-64 max-w-[82%] flex-col border-r border-border bg-background shadow-pop">
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
                  <Logo className="h-6 w-auto text-foreground" />
                  <button
                    onClick={() => setOpen(false)}
                    aria-label="Cerrar menú"
                    className="cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <NavList permisos={permSet} onNavigate={() => setOpen(false)} />
              </div>
            </div>
          )}

          <main className="min-w-0 lg:pl-56">{children}</main>
        </>
      ) : (
        <div className="min-h-screen">
          <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
            <div className="brand-gradient h-[2px] w-full" />
            <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:px-6">
              <Link href="/" className="flex shrink-0 items-center" aria-label="Fiable — inicio">
                <Logo className="h-6 w-auto text-foreground" />
              </Link>
              <div className="ml-auto flex items-center gap-2">
                <Link
                  href="/tienda"
                  className="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  Catálogo
                </Link>
                <SignInButton mode="modal">
                  <button className="cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                    Entrar
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="cursor-pointer rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                    Crear cuenta
                  </button>
                </SignUpButton>
              </div>
            </div>
          </header>
          <main>{children}</main>
        </div>
      )}
    </>
  );
}
