"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Clock, Loader2, ShieldCheck, ShoppingCart, XCircle } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { MARCA } from "@/lib/marca";
import {
  cargarCotizacionPublica,
  aceptarCotizacionPublica,
  pagarCotizacion,
  type CotPublica,
  type CotPublicaItem,
} from "./public-actions";
import { cotizarParaCP, lugarDeCP, type OpcionEnvio } from "@/modules/tienda/checkout-actions";

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

      <div className="overflow-hidden rounded-2xl border border-tienda-100 dark:border-tienda-900 bg-background shadow-sm">
        {cot.cliente && (
          <div className="border-b border-tienda-50 px-5 py-3 text-sm">
            <span className="text-muted-foreground">Cliente: </span>
            <span className="font-medium">{cot.cliente}</span>
          </div>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-tienda-50 text-left text-xs text-muted-foreground">
              <th className="px-5 py-2.5 font-medium">Producto</th>
              <th className="px-2 py-2.5 text-right font-medium">Cant.</th>
              <th className="px-5 py-2.5 text-right font-medium">Importe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tienda-50">
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
            <tr className="border-t border-tienda-100 dark:border-tienda-900 bg-tienda-50/40 dark:bg-tienda-950/40">
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
        <div className="rounded-2xl border border-tienda-100 dark:border-tienda-900 bg-background p-4 text-sm">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Notas</p>
          <p>{cot.notas}</p>
        </div>
      )}

      {(puedeAceptar || (cot.estado === "autorizada" && !cot.vencida)) && (
        <PagoBloque token={token} cot={cot} piezas={items.reduce((s, i) => s + i.qty, 0)} />
      )}

      {puedeAceptar && (
        <div className="space-y-2">
          <button
            onClick={aceptar}
            disabled={pending}
            className="mx-auto block cursor-pointer text-center text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
          >
            {pending ? "Autorizando…" : "Solo autorizar por ahora (te contactamos para el pago)"}
          </button>
          {error && <p className="text-center text-sm text-red-600 dark:text-red-400">{error}</p>}
          {cot.expires_at && (
            <p className="text-center text-xs text-muted-foreground">Válida hasta el {fecha(cot.expires_at)}.</p>
          )}
        </div>
      )}
    </Shell>
  );
}

/**
 * The quote's own checkout: the customer completes the purchase right here —
 * transfer payment, pickup (send your own Uber if you like) or shipping — with
 * the QUOTED prices. This is the step that used to be "a seller will call".
 */
function PagoBloque({ token, cot, piezas }: { token: string; cot: CotPublica; piezas: number }) {
  const [nombre, setNombre] = useState(cot.cliente ?? "");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [entrega, setEntrega] = useState<"recoger" | "envio">("recoger");
  const [cp, setCp] = useState("");
  const [estadoDir, setEstadoDir] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [direccion, setDireccion] = useState("");
  const [opciones, setOpciones] = useState<OpcionEnvio[] | null>(null);
  const [envio, setEnvio] = useState<OpcionEnvio | null>(null);
  const [cotizando, setCotizando] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // CP → estado/municipio, same convenience the storefront checkout has.
  useEffect(() => {
    if (!/^\d{5}$/.test(cp)) return;
    let off = false;
    lugarDeCP(cp)
      .then((l) => {
        if (off || !l) return;
        setEstadoDir((e) => e || l.estado);
        setMunicipio((m) => m || l.municipio);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [cp]);

  async function cotizarEnvio() {
    setErr(null);
    setCotizando(true);
    try {
      const r = await cotizarParaCP(cp, estadoDir, municipio, piezas);
      if (!r.ok) throw new Error(r.error);
      setOpciones(r.data);
      setEnvio(r.data[0] ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo cotizar el envío");
    } finally {
      setCotizando(false);
    }
  }

  const datosListos =
    nombre.trim().length > 2 &&
    /^\S+@\S+\.\S+$/.test(email) &&
    telefono.replace(/\D/g, "").length >= 10 &&
    (entrega === "recoger" ||
      (/^\d{5}$/.test(cp) && direccion.trim().length > 5 && envio !== null));

  async function pagar() {
    if (!datosListos || pagando) return;
    setPagando(true);
    setErr(null);
    try {
      const r = await pagarCotizacion(token, {
        nombre,
        email,
        telefono,
        tipoEntrega: entrega,
        cp,
        estado: estadoDir,
        municipio,
        direccion,
        envio: entrega === "envio" && envio
          ? { totalCents: envio.totalCents, proveedor: envio.proveedor, servicio: envio.servicio, dias: envio.dias }
          : null,
      });
      if (!r.ok) throw new Error(r.error);
      window.location.href = `/tienda/orden/${r.data.ordenId}`;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo generar la orden");
      setPagando(false);
    }
  }

  const inputCls =
    "h-11 w-full rounded-xl border border-tienda-200 bg-background px-3 text-base sm:text-sm outline-none focus:ring-2 focus:ring-tienda-500/30 dark:border-tienda-800";

  return (
    <div className="space-y-3 rounded-2xl border border-tienda-100 dark:border-tienda-900 bg-background p-5 shadow-sm">
      <h2 className="text-sm font-semibold">Completar tu compra</h2>
      <p className="text-xs text-muted-foreground">
        Pagas por transferencia y {entrega === "recoger" ? "recoges en tienda — puedes mandar tu Uber o repartidor" : "te lo enviamos por paquetería"}.
      </p>

      <input className={inputCls} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input className={inputCls} value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" placeholder="WhatsApp (10 dígitos)" />
        <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" placeholder="Correo" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["recoger", "Recoger / mandar Uber"],
            ["envio", "Envío a domicilio"],
          ] as const
        ).map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => setEntrega(v)}
            className={
              "cursor-pointer rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors " +
              (entrega === v
                ? "border-tienda-500 bg-tienda-50/60 dark:bg-tienda-950/40"
                : "border-tienda-100 hover:border-tienda-300 dark:border-tienda-900")
            }
          >
            {l}
          </button>
        ))}
      </div>

      {entrega === "envio" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} value={cp} onChange={(e) => setCp(e.target.value)} inputMode="numeric" placeholder="C.P." />
            <input className={inputCls} value={municipio} onChange={(e) => setMunicipio(e.target.value)} placeholder="Municipio" />
          </div>
          <input className={inputCls} value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Calle, número y colonia" />
          {!opciones ? (
            <button
              type="button"
              onClick={cotizarEnvio}
              disabled={!/^\d{5}$/.test(cp) || municipio.trim().length < 2 || cotizando}
              className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-tienda-200 text-sm font-medium disabled:opacity-50 dark:border-tienda-800"
            >
              {cotizando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Cotizar envío
            </button>
          ) : (
            <div className="space-y-1.5">
              {opciones.map((o, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setEnvio(o)}
                  className={
                    "flex w-full cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-sm " +
                    (envio?.proveedor === o.proveedor && envio?.servicio === o.servicio
                      ? "border-tienda-500 bg-tienda-50/60 dark:bg-tienda-950/40"
                      : "border-tienda-100 dark:border-tienda-900")
                  }
                >
                  <span>{o.proveedor} · {o.servicio}</span>
                  <span className="font-semibold tabular-nums">{formatMXN(o.totalCents)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={pagar}
        disabled={!datosListos || pagando}
        className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-green-600 text-sm font-semibold text-white shadow-sm shadow-green-600/30 transition-colors hover:bg-green-700 disabled:opacity-60"
      >
        <ShoppingCart className="h-4 w-4" />
        {pagando ? "Generando tu orden…" : `Pagar por transferencia · ${formatMXN(cot.total_cents + (entrega === "envio" && envio ? envio.totalCents : 0))}`}
      </button>
      {err && <p className="text-center text-sm text-red-600 dark:text-red-400">{err}</p>}
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" /> Te damos los datos bancarios al confirmar; tu pieza queda apartada.
      </p>
    </div>
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
