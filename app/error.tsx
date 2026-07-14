"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Route-level error boundary. Without this the user sees Next's raw
// "Server Components render" text. The digest is shown on purpose: it's the
// only handle that ties what the user saw to the Vercel log line.
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route-error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-lg font-semibold tracking-tight">
        Algo salió mal
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        No pudimos cargar esta pantalla. Vuelve a intentarlo; si sigue fallando,
        pásale este código a soporte.
      </p>

      {error.digest && (
        <code className="mt-3 rounded-lg bg-muted px-2.5 py-1 font-mono text-xs">
          Código: {error.digest}
        </code>
      )}

      <Button className="mt-5" onClick={reset}>
        <RotateCw className="h-4 w-4" />
        Reintentar
      </Button>
    </div>
  );
}
