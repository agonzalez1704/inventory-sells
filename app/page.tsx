import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { Camera, Boxes, ShoppingCart, ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";

const features = [
  {
    icon: Camera,
    title: "Carga por foto",
    desc: "Sube una foto o Excel y la IA arma tu catálogo.",
  },
  {
    icon: Boxes,
    title: "Control de stock",
    desc: "Cada venta descuenta inventario. Sin sobreventa.",
  },
  {
    icon: ShoppingCart,
    title: "Ventas rápidas",
    desc: "Busca, agrega, cobra. Pensado para el mostrador.",
  },
];

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/inventario");

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6">
      <section className="flex flex-col items-center py-20 text-center sm:py-28">
        <Logo className="mb-6 h-10 w-auto text-foreground" />
        <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Inventario + punto de venta
        </span>
        <h1 className="max-w-2xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Tu inventario y tus ventas, sin complicaciones
        </h1>
        <p className="mt-4 max-w-xl text-pretty text-base text-muted-foreground">
          Carga productos desde una foto o Excel, registra ventas en segundos y
          mantén el stock siempre al día.
        </p>
        <div className="mt-8 flex items-center gap-3">
          <SignUpButton mode="modal">
            <button className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              Crear cuenta
              <ArrowRight className="h-4 w-4" />
            </button>
          </SignUpButton>
          <SignInButton mode="modal">
            <button className="inline-flex h-11 cursor-pointer items-center rounded-xl border border-border bg-background px-5 text-sm font-medium transition-colors hover:bg-muted">
              Entrar
            </button>
          </SignInButton>
        </div>
      </section>

      <section className="grid gap-4 pb-20 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="rounded-xl border border-border bg-background p-5 shadow-card"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="mt-3 text-sm font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
