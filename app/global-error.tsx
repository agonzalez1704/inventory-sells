"use client";

import { useEffect } from "react";

// Last resort: an error in the root layout itself. Must render its own
// <html>/<body> — no app chrome is available here, so keep it dependency-free.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="es-MX">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
          margin: 0,
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "24rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
            Algo salió mal
          </h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#475569" }}>
            La aplicación no pudo cargar. Reintenta; si sigue fallando, pásale
            este código a soporte.
          </p>
          {error.digest && (
            <code
              style={{
                display: "inline-block",
                marginTop: "0.75rem",
                background: "#e2e8f0",
                borderRadius: "0.5rem",
                padding: "0.25rem 0.625rem",
                fontSize: "0.75rem",
              }}
            >
              Código: {error.digest}
            </code>
          )}
          <div style={{ marginTop: "1.25rem" }}>
            <button
              onClick={reset}
              style={{
                cursor: "pointer",
                borderRadius: "0.625rem",
                border: "none",
                background: "#0f172a",
                color: "#fff",
                padding: "0.625rem 1.25rem",
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
