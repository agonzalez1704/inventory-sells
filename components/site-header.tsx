"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, UserButton, SignInButton, SignUpButton } from "@clerk/nextjs";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { AsesorNavBadge } from "@/components/asesor-nav-badge";

const links = [
  { href: "/inventario", label: "Inventario", icon: Boxes },
  { href: "/ventas", label: "Ventas", icon: ShoppingCart },
  { href: "/fiados", label: "Fiados", icon: HandCoins },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/adelantos", label: "Adelantos", icon: Wallet },
  { href: "/asesor", label: "Asesor", icon: Headset },
  { href: "/caja", label: "Caja", icon: Calculator },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export function SiteHeader() {
  const pathname = usePathname();

  // The public storefront (Lead Displays) has its own brand + header.
  if (pathname.startsWith("/tienda")) return null;

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="brand-gradient h-[2px] w-full" />
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center"
          aria-label="Fiable — inicio"
        >
          <Logo className="h-6 w-auto text-foreground" />
        </Link>

        <Show when="signed-in">
          {/* Scrolls horizontally instead of pushing the page off-screen when
              the icons don't fit (mobile). Logo + user button stay fixed. */}
          <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-1 [&::-webkit-scrollbar]:hidden">
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">{label}</span>
                  {href === "/asesor" && <AsesorNavBadge />}
                </Link>
              );
            })}
          </nav>
          <div className="flex shrink-0 items-center border-l border-border pl-2 sm:pl-3">
            <UserButton />
          </div>
        </Show>

        <Show when="signed-out">
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
        </Show>
      </div>
    </header>
  );
}
