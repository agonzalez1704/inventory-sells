"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Clock, Loader2, ShieldCheck, ShoppingCart, XCircle } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { MARCA } from "@/lib/marca";
import {
  cargarCotizacionPublica,
  aceptarCotizacionPublica,
  type CotPublica,
  type CotPublicaItem,
} from "./public-actions";

function fecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" });
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f8ff] px-4 py-8 text-foreground">
      <div className="mx-auto max-w-lg space-y-4">
        <div className="text-center">
          <h1 className="text-lg font-semibold tracking-tight">{MARCA.tienda.nombre}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

// The share_token lives in the URL FRAGMENT (#token), which the browser never
// sends to the server — so it stays out of access logs, Referer and link
// previews. We read it client-side and pass it to the actions in the POST body.
export function CotizacionPublica() {
  const [phase, setPhase] = useState<"loading" | "ready" | "notfound">("loading");
  const [token, setToken] = useState("");
  const [cot, setCot] = useState<CotPublica | null>(null);
  const [items, setItems] = useState<CotPublicaItem[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = window.location.hash.replace(/^#/, "").trim();
    if (!t) {
      setPhase("notfound");
      return;
    }
    setToken(t);
    cargarCotizacionPublica(t)
      .then((d) => {
        if (!d) {
          setPhase("notfound");
          return;
        }
        setCot(d.cot);
        setItems(d.items);
        setPhase("ready");
      })
      .catch(() => setPhase("notfound"));
  }, []);

  function aceptar() {
    setError(null);
    startTransition(async () => {
      const res = await aceptarCotizacionPublica(token);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Re-fetch to reflect the new estado (no token in the URL to refresh).
      const d = await cargarCotizacionPublica(token);
      if (d) {
        setCot(d.cot);
        setItems(d.items);
      }
    });
  }

  if (phase === "loading")
    return (
      <Shell>
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </Shell>
    );

  if (phase === "notfound" || !cot)
    return (
      <Shell>
        <Banner
          tone="neutral"
          icon={<XCircle className="h-5 w-5" />}
          title="Cotización no disponible"
          body="El enlace no es válido o la cotización ya no existe. Contáctanos por WhatsApp."
        />
      </Shell>
    );

  const puedeAceptar = cot.estado === "pendiente" && !cot.vencida;

  return (
    <Shell>
      <p className="-mt-3 text-center text-sm text-muted-foreground">
        Cotización <span className="font-mono">{cot.folio}</span>
      </p>

      <Estado cot={cot} />

      <div className="overflow-hidden rounded-2xl border border-blue-100 dark:border-blue-900 bg-background shadow-sm">
        {cot.cliente && (
          <div className="border-b border-blue-50 px-5 py-3 text-sm">
            <span className="text-muted-foreground">Cliente: </span>
            <span className="font-medium">{cot.cliente}</span>
          </div>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-blue-50 text-left text-xs text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">Producto</th>
              <th className="px-2 py-2.5 text-right font-medium">Cant.</th>
              <th className="px-5 py-2.5 text-right font-medium">Importe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-50">
            {items.map((it, i) => (
              <tr key={i}>
                <td className="px-5 py-3">
                  <p className="font-medium">{it.nombre}</p>
                  <p className="text-xs text-muted-foreground">{formatMXN(it.unit_price_cents)} c/u</p>
                </td>
                <td className="px-2 py-3 text-right tabular-nums">{it.qty}</td>
                <td className="px-5 py-3 text-right font-medium tabular-nums">
                  {formatMXN(it.line_total_cents)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-blue-100 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/40">
              <td colSpan={2} className="px-5 py-3 text-right font-medium">
                Total
              </td>
              <td className="px-5 py-3 text-right font-mono text-lg font-semibold tabular-nums">
                {formatMXN(cot.total_cents)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {cot.notas && (
        <div className="rounded-2xl border border-blue-100 dark:border-blue-900 bg-background p-4 text-sm">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Notas</p>
          <p>{cot.notas}</p>
        </div>
      )}

      {puedeAceptar && (
        <div className="space-y-2">
          <button
            onClick={aceptar}
            disabled={pending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-green-600 text-sm font-semibold text-white shadow-sm shadow-green-600/30 transition-colors hover:bg-green-700 disabled:opacity-60"
          >
            <ShoppingCart className="h-4 w-4" />
            {pending ? "Autorizando…" : "Autorizar cotización"}
          </button>
          {error && <p className="text-center text-sm text-red-600 dark:text-red-400">{error}</p>}
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Al autorizar confirmas los productos y el total.
          </p>
          {cot.expires_at && (
            <p className="text-center text-xs text-muted-foreground">Válida hasta el {fecha(cot.expires_at)}.</p>
          )}
        </div>
      )}
    </Shell>
  );
}

function Estado({ cot }: { cot: CotPublica }) {
  if (cot.estado === "autorizada" || cot.estado === "convertida")
    return (
      <Banner
        tone="success"
        icon={<CheckCircle2 className="h-5 w-5" />}
        title="Cotización autorizada"
        body="¡Gracias! Un vendedor se encargará de surtir tu pedido."
      />
    );
  if (cot.estado === "cancelada")
    return (
      <Banner
        tone="neutral"
        icon={<XCircle className="h-5 w-5" />}
        title="Cotización cancelada"
        body="Esta cotización ya no está disponible. Contáctanos si necesitas otra."
      />
    );
  if (cot.vencida)
    return (
      <Banner
        tone="warning"
        icon={<Clock className="h-5 w-5" />}
        title="Cotización vencida"
        body="Esta cotización ya venció. Pídenos una nueva por WhatsApp."
      />
    );
  return null;
}

function Banner({
  tone,
  icon,
  title,
  body,
}: {
  tone: "success" | "warning" | "neutral";
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  const styles = {
    success: "border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300",
    warning: "border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300",
    neutral: "border-border bg-muted text-foreground",
  }[tone];
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 ${styles}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm">{body}</p>
      </div>
    </div>
  );
}
