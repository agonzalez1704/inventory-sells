"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Show, UserButton, SignInButton, SignUpButton } from "@clerk/nextjs";
import { Boxes, ShoppingCart, HandCoins } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";

const links = [
  { href: "/inventario", label: "Inventario", icon: Boxes },
  { href: "/ventas", label: "Ventas", icon: ShoppingCart },
  { href: "/fiados", label: "Fiados", icon: HandCoins },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center" aria-label="Fiable — inicio">
          <Logo className="h-6 w-auto text-foreground" />
        </Link>

        <Show when="signed-in">
          <nav className="flex items-center gap-1">
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </Link>
              );
            })}
            <div className="ml-2 flex items-center border-l border-border pl-3">
              <UserButton />
            </div>
          </nav>
        </Show>

        <Show when="signed-out">
          <div className="flex items-center gap-2">
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
