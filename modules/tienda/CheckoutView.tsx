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
  Store as StoreIcon,
  MapPin,
} from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { TIENDA } from "@/lib/tienda-info";
import { useRouter } from "next/navigation";
import { tokenizarTarjeta, type DatosTarjeta } from "@/lib/conekta-client";
import { useCart } from "./CartProvider";
import { PagoSection } from "./PagoSection";
import { esConekta, type MetodoPago } from "./pago-const";
import { crearOrdenYPagar, crearOrdenTransferencia, type TipoEntrega } from "./pago-actions";
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
  const { items, setQty, ready, clear } = useCart();
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cómo recibe el pedido: envío a domicilio (foráneo) o recoger (local, manda
  // su propio Uber/mensajero — sin guía, sin costo de envío).
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>("envio");
  const recoger = tipoEntrega === "recoger";

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

  // Pago
  const router = useRouter();
  const [metodo, setMetodo] = useState<MetodoPago>("card");
  const [tarjeta, setTarjeta] = useState<DatosTarjeta>({
    numero: "",
    nombre: "",
    mes: "",
    anio: "",
    cvc: "",
  });
  const [pagando, setPagando] = useState(false);
  const [errPago, setErrPago] = useState<string | null>(null);

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
  const total = subtotal + (recoger ? 0 : envio?.totalCents ?? 0);

  const datosBase =
    nombre.trim().length > 2 &&
    /^\S+@\S+\.\S+$/.test(email) &&
    telefono.replace(/\D/g, "").length >= 10;

  // Pickup needs no address; a shipment needs the full one.
  const datosListos =
    datosBase &&
    (recoger ||
      (/^\d{5}$/.test(cp) &&
        estado !== "" &&
        municipio.trim().length > 1 &&
        direccion.trim().length > 5));

  // A shipment can't proceed without a chosen rate; pickup has none.
  const envioListo = recoger || envio !== null;

  const tarjetaLista =
    metodo !== "card" ||
    (tarjeta.numero.replace(/\D/g, "").length >= 15 &&
      tarjeta.nombre.trim().length > 2 &&
      tarjeta.mes.length >= 1 &&
      tarjeta.anio.length === 4 &&
      tarjeta.cvc.length >= 3);

  async function pagar() {
    if (!resumen || !envioListo) return;
    setErrPago(null);
    setPagando(true);
    try {
      const lineas = resumen.lineas.map((l) => ({ id: l.id, qty: l.qty }));
      const cliente = { nombre, email, telefono, cp, estado, municipio, direccion, referencias };
      const envioElegido =
        recoger || !envio
          ? null
          : { proveedor: envio.proveedor, servicio: envio.servicio, totalCents: envio.totalCents, dias: envio.dias };

      // Direct transfer: no Conekta. Reserve the order and send them to the
      // confirmation page with the bank data; an admin confirms the deposit.
      if (!esConekta(metodo)) {
        const r = await crearOrdenTransferencia(lineas, cliente, envioElegido, tipoEntrega);
        if (!r.ok) {
          setErrPago(r.error);
          return;
        }
        clear();
        router.push(`/tienda/orden/${r.data.ordenId}`);
        return;
      }

      // Conekta: card data is tokenized in the browser — it never reaches us.
      const token = metodo === "card" ? await tokenizarTarjeta(tarjeta) : undefined;
      const r = await crearOrdenYPagar(lineas, cliente, envioElegido, metodo, tipoEntrega, token);
      if (!r.ok) {
        setErrPago(r.error);
        return;
      }
      // 3DS challenge / Aplazo: finish the flow at the provider.
      if (r.data.redirectUrl) {
        window.location.href = r.data.redirectUrl;
        return;
      }
      // The webhook confirms the sale; the page just shows status + voucher.
      clear();
      router.push(`/tienda/orden/${r.data.ordenId}`);
    } catch (e) {
      setErrPago(e instanceof Error ? e.message : "No se pudo procesar el pago");
    } finally {
      setPagando(false);
    }
  }

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
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
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
          <p className="text-sm font-medium text-foreground">
            {error ?? "Tu carrito está vacío"}
          </p>
          <Link
            href="/tienda"
            className="inline-flex h-11 items-center rounded-xl bg-tienda-600 px-5 text-sm font-semibold text-white hover:bg-tienda-700"
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
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-tienda-700 dark:text-tienda-300"
      >
        <ArrowLeft className="h-4 w-4" />
        Seguir comprando
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground [font-family:var(--font-display)]">
        Finalizar compra
      </h1>

      {resumen && resumen.removidos.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Quitamos de tu carrito lo que ya no está disponible:{" "}
          {resumen.removidos.join(", ")}.
        </p>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        {/* Form */}
        <div className="space-y-5 lg:col-span-3">
          <Card titulo="¿Cómo lo recibes?">
            <div className="grid grid-cols-2 gap-2">
              <EntregaTile
                activo={!recoger}
                onClick={() => setTipoEntrega("envio")}
                icon={Truck}
                titulo="Envío a domicilio"
                desc="Te lo mandamos por paquetería"
              />
              <EntregaTile
                activo={recoger}
                onClick={() => setTipoEntrega("recoger")}
                icon={StoreIcon}
                titulo="Recoger / mando por mi cuenta"
                desc="Sin costo de envío"
              />
            </div>
          </Card>

          <Card titulo="Tus datos">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre completo" value={nombre} onChange={setNombre} className="sm:col-span-2" />
              <Field label="Correo" value={email} onChange={setEmail} type="email" hint="Ahí te enviamos el comprobante" />
              <Field label="WhatsApp / teléfono" value={telefono} onChange={setTelefono} inputMode="tel" />
            </div>
          </Card>

          {recoger ? (
            <Card titulo="Recoger en tienda">
              <div className="flex items-start gap-3 rounded-xl bg-tienda-50/60 dark:bg-tienda-950/40 p-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-tienda-600 dark:text-tienda-400" />
                <div className="text-sm text-foreground">
                  <p className="font-medium text-foreground">{TIENDA.direccion}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{TIENDA.horario}</p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    Prepara tu pedido en cuanto se confirme el pago. Puedes venir tú
                    o mandar un mensajero/Uber — solo dan tu folio al recoger.
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <>
          <Card titulo="Dirección de envío">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Código postal" value={cp} onChange={(v) => setCp(v.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" />
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">Estado</span>
                <select
                  value={estado}
                  onChange={(e) => setEstado(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-tienda-400"
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
                <p className="text-xs text-muted-foreground">
                  Calculamos el costo real con tu código postal.
                </p>
                <button
                  onClick={cotizar}
                  disabled={!/^\d{5}$/.test(cp) || !estado || municipio.trim().length < 2 || cotizando}
                  className="mt-3 inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                >
                  {cotizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                  Cotizar envío
                </button>
                {errEnvio && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400">{errEnvio}</p>
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
                        sel ? "border-tienda-500 bg-tienda-50/60 dark:bg-tienda-950/40" : "border-border hover:border-tienda-200 dark:border-tienda-900",
                      )}
                    >
                      <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", sel ? "border-tienda-600 bg-tienda-600 text-white" : "border-border")}>
                        {sel && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {o.proveedor} · {o.servicio}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {o.dias ? `Entrega estimada ${o.dias} día${o.dias > 1 ? "s" : ""}` : "Entrega estimada según destino"}
                          {i === 0 && " · más económico"}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                        {formatMXN(o.totalCents)}
                      </span>
                    </button>
                  );
                })}
                <button onClick={cotizar} disabled={cotizando} className="cursor-pointer text-xs font-medium text-tienda-700 dark:text-tienda-300 hover:underline">
                  Volver a cotizar
                </button>
              </div>
            )}
          </Card>
            </>
          )}

          <PagoSection
            metodo={metodo}
            setMetodo={setMetodo}
            tarjeta={tarjeta}
            setTarjeta={setTarjeta}
          />
        </div>

        {/* Summary */}
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-border bg-background p-4 lg:sticky lg:top-24">
            <h2 className="text-sm font-semibold text-foreground">Tu pedido</h2>
            <ul className="mt-3 divide-y divide-border">
              {resumen?.lineas.map((l) => (
                <li key={l.id} className="flex gap-3 py-2.5">
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-background">
                    {l.imagen ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.imagen} alt={l.nombre} className="h-full w-full object-contain" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-tienda-300">
                        <Smartphone className="h-5 w-5" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-foreground">{l.nombre}</span>
                    <span className="block text-xs text-muted-foreground">{l.qty} × {formatMXN(l.precio_cents)}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                    {formatMXN(l.precio_cents * l.qty)}
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatMXN(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{recoger ? "Entrega" : "Envío"}</dt>
                <dd className="tabular-nums">
                  {recoger ? (
                    <span className="text-xs font-medium text-green-700 dark:text-green-300">Recoger · gratis</span>
                  ) : envio ? (
                    formatMXN(envio.totalCents)
                  ) : (
                    <span className="text-xs text-muted-foreground">Cotiza arriba</span>
                  )}
                </dd>
              </div>
              <div className="flex items-baseline justify-between border-t border-border pt-2">
                <dt className="font-semibold text-foreground">Total</dt>
                <dd className="text-xl font-semibold tabular-nums text-tienda-800 dark:text-tienda-300">{formatMXN(total)}</dd>
              </div>
            </dl>

            <button
              onClick={pagar}
              disabled={!datosListos || !envioListo || !tarjetaLista || pagando}
              className="mt-4 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-tienda-600 text-sm font-semibold text-white shadow-sm shadow-tienda-600/30 transition-colors hover:bg-tienda-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
            >
              {pagando && <Loader2 className="h-4 w-4 animate-spin" />}
              {pagando
                ? "Procesando…"
                : !envioListo
                  ? "Cotiza el envío para continuar"
                  : !datosListos
                    ? "Completa tus datos"
                    : metodo === "transferencia"
                      ? "Apartar con transferencia"
                      : metodo === "card"
                        ? `Pagar ${formatMXN(total)}`
                        : metodo === "oxxo"
                          ? "Generar ficha OXXO"
                          : metodo === "spei"
                            ? "Generar CLABE"
                            : "Continuar con Aplazo"}
            </button>

            {errPago && (
              <p className="mt-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                {errPago}
              </p>
            )}

            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tienda-500" />
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

function EntregaTile({
  activo,
  onClick,
  icon: Icon,
  titulo,
  desc,
}: {
  activo: boolean;
  onClick: () => void;
  icon: typeof Truck;
  titulo: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex cursor-pointer flex-col gap-1 rounded-xl border p-3 text-left transition-colors",
        activo ? "border-tienda-500 bg-tienda-50/60 dark:bg-tienda-950/40 text-tienda-800 dark:text-tienda-300" : "border-border text-muted-foreground hover:border-tienda-200 dark:border-tienda-900",
      )}
    >
      <Icon className="h-5 w-5" />
      <span className="text-sm font-semibold leading-tight">{titulo}</span>
      <span className="text-[11px] leading-tight text-muted-foreground">{desc}</span>
    </button>
  );
}

function Card({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-background p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">{titulo}</h2>
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
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-tienda-400"
      />
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}
