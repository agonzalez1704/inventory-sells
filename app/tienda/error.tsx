"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";

// Storefront boundary. Without it an error in any /tienda page bubbles to
// app/error.tsx, which sits above this layout — the customer would lose the
// header, the cart button and the way back to the catalog. Here the failure
// stays inside the shop chrome, and the cart (layout state) survives.
export default function TiendaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[tienda-error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-lg font-semibold tracking-tight">
        No pudimos cargar esta página
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Tu carrito sigue guardado. Vuelve a intentarlo en un momento.
      </p>
      {error.digest && (
        <code className="mt-3 rounded-lg bg-muted px-2.5 py-1 font-mono text-xs">
          Código: {error.digest}
        </code>
      )}
      <div className="mt-5 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <button
          onClick={reset}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-tienda-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-tienda-700"
        >
          <RotateCw className="h-4 w-4" />
          Reintentar
        </button>
        <Link
          href="/tienda"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-tienda-200 bg-white px-5 text-sm font-semibold text-tienda-700 transition-colors hover:bg-tienda-50"
        >
          Volver al catálogo
        </Link>
      </div>
    </div>
  );
}
