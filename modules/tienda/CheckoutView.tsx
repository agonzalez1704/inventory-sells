"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Truck,
  Loader2,
  Smartphone,
  ShieldCheck,
  AlertTriangle,
  Check,
} from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { TIENDA } from "@/lib/tienda-info";
import { useCart } from "./CartProvider";
import {
  validarCarrito,
  cotizarParaCP,
  type Resumen,
  type OpcionEnvio,
} from "./checkout-actions";

const ESTADOS = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche",
  "Chiapas", "Chihuahua", "Ciudad de Mexico", "Coahuila", "Colima", "Durango",
  "Estado de Mexico", "Guanajuato", "Guerrero", "Hidalgo", "Jalisco",
  "Michoacan", "Morelos", "Nayarit", "Nuevo Leon", "Oaxaca", "Puebla",
  "Queretaro", "Quintana Roo", "San Luis Potosi", "Sinaloa", "Sonora",
  "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatan", "Zacatecas",
];

export function CheckoutView() {
  const { items, setQty, ready } = useCart();
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Datos del cliente
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  // Envío
  const [cp, setCp] = useState("");
  const [estado, setEstado] = useState("");
  const [municipio, setMunicipio] = useState("");
  const [direccion, setDireccion] = useState("");
  const [referencias, setReferencias] = useState("");

  const [opciones, setOpciones] = useState<OpcionEnvio[] | null>(null);
  const [envio, setEnvio] = useState<OpcionEnvio | null>(null);
  const [cotizando, start] = useTransition();
  const [errEnvio, setErrEnvio] = useState<string | null>(null);

  // Re-price against the catalog — the cart is localStorage and can be stale.
  useEffect(() => {
    if (!ready) return;
    if (items.length === 0) {
      setCargando(false);
      return;
    }
    setCargando(true);
    validarCarrito(items.map((i) => ({ id: i.id, qty: i.qty })))
      .then((r) => {
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setResumen(r.data);
        // Sync the cart if the catalog capped or dropped anything.
        for (const l of r.data.lineas) {
          const cur = items.find((i) => i.id === l.id);
          if (cur && cur.qty !== l.qty) setQty(l.id, l.qty);
        }
      })
      .finally(() => setCargando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Any address change invalidates a quote — never charge a rate for another CP.
  useEffect(() => {
    setOpciones(null);
    setEnvio(null);
  }, [cp, estado, municipio]);

  const piezas = resumen?.lineas.reduce((s, l) => s + l.qty, 0) ?? 0;
  const subtotal = resumen?.subtotal_cents ?? 0;
  const total = subtotal + (envio?.totalCents ?? 0);

  const datosListos =
    nombre.trim().length > 2 &&
    /^\S+@\S+\.\S+$/.test(email) &&
    telefono.replace(/\D/g, "").length >= 10 &&
    /^\d{5}$/.test(cp) &&
    estado !== "" &&
    municipio.trim().length > 1 &&
    direccion.trim().length > 5;

  function cotizar() {
    setErrEnvio(null);
    start(async () => {
      const r = await cotizarParaCP(cp, estado, municipio, piezas);
      if (!r.ok) {
        setErrEnvio(r.error);
        setOpciones(null);
        return;
      }
      setOpciones(r.data);
      setEnvio(r.data[0] ?? null); // cheapest by default
    });
  }

  if (!ready || cargando) {
    return (
      <Wrap>
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparando tu pedido…
        </div>
      </Wrap>
    );
  }

  if (items.length === 0 || error) {
    return (
      <Wrap>
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <p className="text-sm font-medium text-slate-700">
            {error ?? "Tu carrito está vacío"}
          </p>
          <Link
            href="/tienda"
            className="inline-flex h-11 items-center rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Ir al catálogo
          </Link>
        </div>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <Link
        href="/tienda"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-blue-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Seguir comprando
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 [font-family:var(--font-display)]">
        Finalizar compra
      </h1>

      {resumen && resumen.removidos.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Quitamos de tu carrito lo que ya no está disponible:{" "}
          {resumen.removidos.join(", ")}.
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* Form */}
        <div className="space-y-5 lg:col-span-3">
          <Card titulo="Tus datos">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre completo" value={nombre} onChange={setNombre} className="sm:col-span-2" />
              <Field label="Correo" value={email} onChange={setEmail} type="email" hint="Ahí te enviamos el comprobante" />
              <Field label="WhatsApp / teléfono" value={telefono} onChange={setTelefono} inputMode="tel" />
            </div>
          </Card>

          <Card titulo="Dirección de envío">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Código postal" value={cp} onChange={(v) => setCp(v.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" />
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Estado</span>
                <select
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">Elige…</option>
                  {ESTADOS.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </label>
              <Field label="Municipio / alcaldía" value={municipio} onChange={setMunicipio} />
              <Field label="Calle y número" value={direccion} onChange={setDireccion} className="sm:col-span-2" />
              <Field label="Colonia y referencias (opcional)" value={referencias} onChange={setReferencias} className="sm:col-span-2" />
            </div>
          </Card>

          <Card titulo="Envío">
            {!opciones ? (
              <>
                <p className="text-xs text-slate-500">
                  Calculamos el costo real con tu código postal.
                </p>
                <button
                  onClick={cotizar}
                  disabled={!/^\d{5}$/.test(cp) || !estado || municipio.trim().length < 2 || cotizando}
                  className="mt-3 inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {cotizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                  Cotizar envío
                </button>
                {errEnvio && (
                  <p className="mt-2 text-xs text-red-600">{errEnvio}</p>
                )}
              </>
            ) : (
              <div className="space-y-2">
                {opciones.map((o, i) => {
                  const sel = envio?.proveedor === o.proveedor && envio?.servicio === o.servicio;
                  return (
                    <button
                      key={`${o.proveedor}-${o.servicio}-${i}`}
                      onClick={() => setEnvio(o)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors",
                        sel ? "border-blue-500 bg-blue-50/60" : "border-slate-200 hover:border-blue-200",
                      )}
                    >
                      <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", sel ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300")}>
                        {sel && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">
                          {o.proveedor} · {o.servicio}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {o.dias ? `Entrega estimada ${o.dias} día${o.dias > 1 ? "s" : ""}` : "Entrega estimada según destino"}
                          {i === 0 && " · más económico"}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                        {formatMXN(o.totalCents)}
                      </span>
                    </button>
                  );
                })}
                <button onClick={cotizar} disabled={cotizando} className="cursor-pointer text-xs font-medium text-blue-700 hover:underline">
                  Volver a cotizar
                </button>
              </div>
            )}
          </Card>
        </div>

        {/* Summary */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:sticky lg:top-24">
            <h2 className="text-sm font-semibold text-slate-900">Tu pedido</h2>
            <ul className="mt-3 divide-y divide-slate-100">
              {resumen?.lineas.map((l) => (
                <li key={l.id} className="flex gap-3 py-2.5">
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {l.imagen ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.imagen} alt={l.nombre} className="h-full w-full object-contain" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-blue-300">
                        <Smartphone className="h-5 w-5" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-slate-900">{l.nombre}</span>
                    <span className="block text-xs text-slate-500">{l.qty} × {formatMXN(l.precio_cents)}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-900">
                    {formatMXN(l.precio_cents * l.qty)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-3 space-y-1.5 border-t border-slate-200 pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-600">Subtotal</dt>
                <dd className="tabular-nums">{formatMXN(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-600">Envío</dt>
                <dd className="tabular-nums">
                  {envio ? formatMXN(envio.totalCents) : <span className="text-xs text-slate-400">Cotiza arriba</span>}
                </dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
                <dt className="font-semibold text-slate-900">Total</dt>
                <dd className="text-xl font-semibold tabular-nums text-blue-800">{formatMXN(total)}</dd>
              </div>
            </dl>

            <button
              disabled={!datosListos || !envio}
              className="mt-4 flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-sm shadow-blue-600/30 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {!envio ? "Cotiza el envío para continuar" : "Continuar al pago"}
            </button>

            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
              {TIENDA.garantiaDias} días de garantía por defecto de fábrica,{" "}
              {TIENDA.garantiaCondicion}.
            </p>
          </div>
        </div>
      </div>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</div>;
}

function Card({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{titulo}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: "text" | "tel" | "email" | "numeric";
  hint?: string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-blue-400"
      />
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}
