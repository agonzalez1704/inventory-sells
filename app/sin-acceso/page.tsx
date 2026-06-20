import { ShieldX } from "lucide-react";
import { SignOutButton } from "@clerk/nextjs";

export default function SinAccesoPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
        <ShieldX className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-xl font-semibold tracking-tight">
        Acceso restringido
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Esta cuenta no está autorizada para usar Fiable. Si crees que es un
        error, contacta al administrador.
      </p>
      <SignOutButton redirectUrl="/">
        <button className="mt-6 inline-flex h-10 cursor-pointer items-center rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted">
          Cerrar sesión
        </button>
      </SignOutButton>
    </main>
  );
}
