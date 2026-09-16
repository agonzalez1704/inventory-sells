"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Truck,
  Loader2,
  Smartphone,
  ShieldCheck,
  AlertTriangle,
  Check,
  Clock,
} from "lucide-react";
import { foto } from "@/lib/foto";
import { formatPrecio } from "@/lib/money";
import { cn } from "@/lib/utils";
import { puntosRecoger } from "@/lib/tienda-info";
import { tokenizarTarjeta, type DatosTarjeta } from "@/lib/conekta-client";
import { useTiendaInfo } from "./TiendaInfoProvider";
import { useCart } from "./CartProvider";
import { PagoSection } from "./PagoSection";
import { EntregaSelector, entregaEfectiva } from "./EntregaSelector";
import { StepperPieza } from "./StepperPieza";
import { etiquetaApartado } from "./apartado";
import { usePreviewApartado } from "./usePreviewApartado";
import { esConekta, type MetodoPago } from "./pago-const";
import { apartarEnSucursal, crearOrdenYPagar, crearOrdenTransferencia } from "./pago-actions";
import { validarCarrito, cotizarParaCP, lugarDeCP, type Resumen, type OpcionEnvio } from "./checkout-actions";
import { MAX_POR_PRODUCTO } from "./AddToCart";

const ESTADOS = [
  "Aguascalientes", "Baja California", "Baja California Sur", "Campeche",
  "Chiapas", "Chihuahua", "Ciudad de Mexico", "Coahuila", "Colima", "Durango",
  "Estado de Mexico", "Guanajuato", "Guerrero", "Hidalgo", "Jalisco",
  "Michoacan", "Morelos", "Nayarit", "Nuevo Leon", "Oaxaca", "Puebla",
  "Queretaro", "Quintana Roo", "San Luis Potosi", "Sinaloa", "Sonora",
  "Tabasco", "Tamaulipas", "Tlaxcala", "Veracruz", "Yucatan", "Zacatecas",
];

const dias = (n: number) => `${n} día${n > 1 ? "s" : ""} hábil${n > 1 ? "es" : ""}`;

/**
 * Checkout, per the approved design: the pieces, how they are received, the
 * customer's data, and — only when something is paid online — how. A fixed
 * summary says what happens on confirm; on a phone its total and button sit at
 * the bottom of the screen.
 *
 * The delivery choice lives in the cart (CartProvider.entrega), so what the
 * customer picked in the sheet is already picked here.
 */
export function CheckoutView() {
  const tienda = useTiendaInfo();
  const puntos = puntosRecoger(tienda);
  const router = useRouter();
  const { items, setQty, ready, clear, entrega, setEntrega } = useCart();

  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { horas, motivo } = usePreviewApartado(items, ready && items.length > 0);
  const e = entregaEfectiva(entrega, puntos, !motivo);
  const recoger = e.tipo === "recoger";
  const apartar = recoger && e.quien === "yo";
  const etiqueta = horas != null ? etiquetaApartado(horas) : null;

  // Datos
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  // Dirección (solo envío)
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
  const [metodo, setMetodo] = useState<MetodoPago>("card");
  const [tarjeta, setTarjeta] = useState<DatosTarjeta>({ numero: "", nombre: "", mes: "", anio: "", cvc: "" });
  const [pagando, setPagando] = useState(false);
  const [errPago, setErrPago] = useState<string | null>(null);

  // Re-price against the catalog whenever the pieces change — the cart is
  // localStorage and can be stale, and the steppers here change it. Quietly
  // after the first load: a spinner on every tap would blank the page.
  const clave = items.map((i) => `${i.id}:${i.qty}`).join(",");
  useEffect(() => {
    if (!ready || items.length === 0) return;
    let vivo = true;
    validarCarrito(items.map((i) => ({ id: i.id, qty: i.qty })))
      .then((r) => {
        if (!vivo) return;
        if (!r.ok) {
          setError(r.error);
          return;
        }
        setError(null);
        setResumen(r.data);
        // Sync the cart if the catalog capped anything.
        for (const l of r.data.lineas) {
          const cur = items.find((i) => i.id === l.id);
          if (cur && cur.qty !== l.qty) setQty(l.id, l.qty);
        }
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, clave]);

  // Lines as the customer sees them right now: catalog prices, cart quantities.
  const lineas = (resumen?.lineas ?? [])
    .map((l) => ({ ...l, qty: items.find((i) => i.id === l.id)?.qty ?? 0 }))
    .filter((l) => l.qty > 0);
  const subtotal = lineas.reduce((s, l) => s + l.precio_cents * l.qty, 0);
  const piezasFisicas = lineas.filter((l) => !l.es_dropship).reduce((s, l) => s + l.qty, 0);
  const hayDropship = lineas.some((l) => l.es_dropship);
  const soloDropship = hayDropship && piezasFisicas === 0;
  const total = subtotal + (recoger ? 0 : (envio?.totalCents ?? 0));

  // A quote is for one address and one parcel: either changing voids it.
  useEffect(() => {
    setOpciones(null);
    setEnvio(null);
  }, [cp, estado, municipio, piezasFisicas]);

  // The postal code implies state and municipality; both stay editable.
  const [colonias, setColonias] = useState<string[]>([]);
  useEffect(() => {
    if (!/^\d{5}$/.test(cp)) {
      setColonias([]);
      return;
    }
    let cancelado = false;
    lugarDeCP(cp)
      .then((l) => {
        if (cancelado || !l) return;
        setColonias(l.colonias);
        setEstado((x) => x || l.estado);
        setMunicipio((x) => x || l.municipio);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [cp]);

  // Email stays required: Conekta demands it on every order and
  // ordenes_web.email is NOT NULL — optional here would fail at the worst moment.
  const datosListos =
    nombre.trim().length > 2 && /^\S+@\S+\.\S+$/.test(email) && telefono.replace(/\D/g, "").length >= 10;
  const direccionLista =
    recoger ||
    (/^\d{5}$/.test(cp) && estado !== "" && municipio.trim().length > 1 && direccion.trim().length > 5);
  const envioListo = recoger || soloDropship || envio !== null;
  const tarjetaLista =
    metodo !== "card" ||
    (tarjeta.numero.replace(/\D/g, "").length >= 15 &&
      tarjeta.nombre.trim().length > 2 &&
      tarjeta.mes.length >= 1 &&
      tarjeta.anio.length === 4 &&
      tarjeta.cvc.length >= 3);
  const listo = datosListos && lineas.length > 0 && (apartar || (direccionLista && envioListo && tarjetaLista));

  const falta = !datosListos
    ? "Completa nombre, WhatsApp y correo"
    : !apartar && !direccionLista
      ? "Completa la dirección de envío"
      : !apartar && !envioListo
        ? "Cotiza el envío para continuar"
        : !apartar && !tarjetaLista
          ? "Completa los datos de la tarjeta"
          : null;

  const cta = apartar
    ? (etiqueta?.cta ?? "Apartar mis piezas")
    : metodo === "card"
      ? `Pagar ${formatPrecio(total)}`
      : metodo === "spei"
        ? "Generar CLABE"
        : metodo === "aplazo"
          ? "Continuar con Aplazo"
          : "Confirmar pedido";

  async function confirmar() {
    if (!listo) return;
    setErrPago(null);
    setPagando(true);
    try {
      const piezas = lineas.map((l) => ({ id: l.id, qty: l.qty }));

      // Coming in person: nothing is charged here. The pieces are held and the
      // counter registers the sale when the customer arrives.
      if (apartar) {
        const r = await apartarEnSucursal(piezas, { nombre, email, telefono }, e.sucursal);
        if (!r.ok) {
          setErrPago(r.error);
          return;
        }
        clear();
        router.push(`/tienda/orden/${r.data.ordenId}`);
        return;
      }

      const cliente = { nombre, email, telefono, cp, estado, municipio, direccion, referencias };
      const envioElegido =
        recoger || !envio
          ? null
          : { proveedor: envio.proveedor, servicio: envio.servicio, totalCents: envio.totalCents, dias: envio.dias };

      // Direct transfer: no Conekta. Reserve and show the bank data; an admin
      // confirms the deposit.
      if (!esConekta(metodo)) {
        const r = await crearOrdenTransferencia(piezas, cliente, envioElegido, e.tipo);
        if (!r.ok) {
          setErrPago(r.error);
          return;
        }
        clear();
        router.push(`/tienda/orden/${r.data.ordenId}`);
        return;
      }

      // Card data is tokenized in the browser — it never reaches us.
      const token = metodo === "card" ? await tokenizarTarjeta(tarjeta) : undefined;
      const r = await crearOrdenYPagar(piezas, cliente, envioElegido, metodo, e.tipo, token);
      if (!r.ok) {
        setErrPago(r.error);
        return;
      }
      if (r.data.redirectUrl) {
        window.location.href = r.data.redirectUrl;
        return;
      }
      clear();
      router.push(`/tienda/orden/${r.data.ordenId}`);
    } catch (err) {
      setErrPago(err instanceof Error ? err.message : "No se pudo procesar el pedido");
    } finally {
      setPagando(false);
    }
  }

  function cotizar() {
    setErrEnvio(null);
    start(async () => {
      const r = await cotizarParaCP(cp, estado, municipio, piezasFisicas);
      if (!r.ok) {
        setErrEnvio(r.error);
        setOpciones(null);
        return;
      }
      setOpciones(r.data);
      setEnvio(r.data[0] ?? null); // cheapest by default
    });
  }

  if (!ready || (items.length > 0 && !resumen && !error)) {
    return (
      <Wrap>
        <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparando tu pedido…
        </div>
      </Wrap>
    );
  }

  if (items.length === 0 || (error && !resumen)) {
    return (
      <Wrap>
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <p className="text-sm font-medium text-foreground">{error ?? "Tu pedido está vacío"}</p>
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

  const entregaResumen = apartar
    ? `Recoges${e.sucursal ? ` en ${e.sucursal}` : ""}`
    : recoger
      ? `Tu Uber recoge${e.sucursal ? ` en ${e.sucursal}` : ""}`
      : "Envío a domicilio";

  const botonConfirmar = (
    <button
      type="button"
      onClick={confirmar}
      disabled={!listo || pagando}
      className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-tienda-600 text-base font-semibold text-white shadow-sm shadow-tienda-600/30 transition-colors hover:bg-tienda-700 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
    >
      {pagando && <Loader2 className="h-4 w-4 animate-spin" />}
      {pagando ? "Procesando…" : cta}
    </button>
  );

  const avisoBajoBoton = errPago ? (
    <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
      {errPago}
    </p>
  ) : (
    <p className="mt-2 text-center text-xs text-muted-foreground">
      {falta ?? (apartar ? (etiqueta?.nota ?? "Pagas al recoger") : "Tus piezas quedan apartadas en cuanto confirmes")}
    </p>
  );

  return (
    // Bottom padding: room for the fixed total bar on phones.
    <div className="mx-auto max-w-6xl px-4 pb-44 pt-1 sm:px-6 lg:pb-12 lg:pt-4">
      <Link
        href="/tienda"
        className="inline-flex h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-tienda-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Seguir comprando
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tu pedido</h1>

      {resumen && resumen.removidos.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Quitamos lo que ya no está disponible: {resumen.removidos.join(", ")}.
        </p>
      )}

      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
        <div className="space-y-4">
          <Seccion>
            <ul className="divide-y divide-border">
              {lineas.map((l) => (
                <li key={l.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-muted/50">
                    {l.imagen ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={foto(l.imagen, 128)} alt={l.nombre} className="h-full w-full object-cover" />
                    ) : (
                      <Smartphone className="h-6 w-6 text-muted-foreground/40" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground">{l.nombre}</p>
                      {l.es_dropship ? (
                        <p className="text-[13px] text-muted-foreground">Directo del proveedor · ~{dias(l.entrega_dias)}</p>
                      ) : l.entrega_dias > 0 ? (
                        <p className="text-[13px] text-amber-700">Sale de otra ciudad · +{dias(l.entrega_dias)}</p>
                      ) : null}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 sm:mt-0">
                      <StepperPieza
                        qty={l.qty}
                        max={items.find((i) => i.id === l.id)?.max ?? MAX_POR_PRODUCTO}
                        nombre={l.nombre}
                        onChange={(q) => setQty(l.id, q)}
                      />
                      <span className="w-20 shrink-0 text-right text-[15px] font-semibold tabular-nums text-foreground">
                        {formatPrecio(l.precio_cents * l.qty)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Seccion>

          <Seccion titulo="¿Cómo lo recibes?">
            <EntregaSelector
              entrega={e}
              onChange={setEntrega}
              puntos={puntos}
              horas={horas}
              motivoNoApartar={motivo}
              entregaDias={tienda.entregaDias}
            />
            {recoger && (
              <p className="mt-3 text-pretty text-[13px] leading-relaxed text-muted-foreground">
                {apartar
                  ? `Te apartamos las piezas ${etiqueta ? etiqueta.plazo : "unas horas"} y pagas en sucursal al recoger. Si no llegas a tiempo, se liberan para otros clientes.`
                  : "Tu Uber solo da el folio en el mostrador, así que el pedido tiene que ir pagado."}
              </p>
            )}
            {!recoger && hayDropship && (
              <p className="mt-3 flex items-start gap-2 text-[13px] leading-relaxed text-muted-foreground">
                <Truck className="mt-0.5 h-4 w-4 shrink-0 text-tienda-600" />
                {soloDropship
                  ? `Tu pedido viaja directo del proveedor: ~${dias(resumen?.demora_dropship ?? 0)}, envío incluido.`
                  : `Llega en 2 entregas: lo nuestro con la paquetería que elijas, y lo del proveedor en ~${dias(resumen?.demora_dropship ?? 0)} con envío incluido.`}
              </p>
            )}
          </Seccion>

          <Seccion titulo="Tus datos">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Nombre"
                placeholder={recoger ? "Quién recoge" : "Quién recibe"}
                value={nombre}
                onChange={setNombre}
                autoComplete="name"
                className="sm:col-span-2"
              />
              <Field
                label="WhatsApp"
                placeholder="10 dígitos"
                value={telefono}
                onChange={setTelefono}
                inputMode="tel"
                autoComplete="tel"
              />
              <Field
                label="Correo"
                hint="ahí te llega el comprobante"
                placeholder="tu@correo.com"
                value={email}
                onChange={setEmail}
                type="email"
                inputMode="email"
                autoComplete="email"
              />
            </div>
          </Seccion>

          {!recoger && (
            <>
              <Seccion titulo="Dirección de envío">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Código postal"
                    value={cp}
                    onChange={(v) => setCp(v.replace(/\D/g, "").slice(0, 5))}
                    inputMode="numeric"
                    autoComplete="postal-code"
                  />
                  <label className="block">
                    <span className="mb-1 block text-[13px] font-medium text-muted-foreground">Estado</span>
                    <select
                      value={estado}
                      onChange={(ev) => setEstado(ev.target.value)}
                      className="h-12 w-full rounded-xl border border-border bg-background px-3 text-base outline-none focus:border-tienda-500 focus:ring-4 focus:ring-tienda-100"
                    >
                      <option value="">Elige…</option>
                      {ESTADOS.map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field label="Municipio / alcaldía" value={municipio} onChange={setMunicipio} autoComplete="address-level2" />
                  <Field
                    label="Colonia y referencias"
                    value={referencias}
                    onChange={setReferencias}
                    list={colonias.length ? "colonias-cp" : undefined}
                  />
                  <Field
                    label="Calle y número"
                    value={direccion}
                    onChange={setDireccion}
                    autoComplete="street-address"
                    className="sm:col-span-2"
                  />
                  {colonias.length > 0 && (
                    <datalist id="colonias-cp">
                      {colonias.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  )}
                </div>
              </Seccion>

              {!soloDropship && (
                <Seccion titulo="Envío">
                  {!opciones ? (
                    <>
                      <p className="text-[13px] text-muted-foreground">Calculamos el costo real con tu código postal.</p>
                      <button
                        type="button"
                        onClick={cotizar}
                        disabled={!/^\d{5}$/.test(cp) || !estado || municipio.trim().length < 2 || cotizando}
                        className="mt-3 inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition-colors disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                      >
                        {cotizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                        Cotizar envío
                      </button>
                      {errEnvio && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{errEnvio}</p>}
                    </>
                  ) : (
                    <div className="space-y-2">
                      {opciones.map((o, i) => {
                        const sel = envio?.proveedor === o.proveedor && envio?.servicio === o.servicio;
                        return (
                          <button
                            type="button"
                            key={`${o.proveedor}-${o.servicio}-${i}`}
                            onClick={() => setEnvio(o)}
                            className={cn(
                              "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                              sel ? "bg-tienda-50/70 ring-2 ring-tienda-600" : "ring-1 ring-border hover:ring-tienda-300",
                            )}
                          >
                            <span
                              className={cn(
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                                sel ? "bg-tienda-600 text-white" : "border-[1.5px] border-muted-foreground/40",
                              )}
                            >
                              {sel && <Check className="h-3 w-3" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">
                                {o.proveedor} · {o.servicio}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {o.dias ? `Entrega estimada ${o.dias} día${o.dias > 1 ? "s" : ""}` : "Entrega según destino"}
                                {i === 0 && " · más económico"}
                              </span>
                            </span>
                            <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                              {formatPrecio(o.totalCents)}
                            </span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={cotizar}
                        disabled={cotizando}
                        className="h-11 cursor-pointer text-xs font-medium text-tienda-700 hover:underline"
                      >
                        Volver a cotizar
                      </button>
                    </div>
                  )}
                </Seccion>
              )}
            </>
          )}

          {/* Only when something is paid online: a hold is charged at the counter. */}
          {!apartar && <PagoSection metodo={metodo} setMetodo={setMetodo} tarjeta={tarjeta} setTarjeta={setTarjeta} />}
        </div>

        <aside className="mt-4 lg:sticky lg:top-20 lg:mt-0 lg:self-start">
          <div className="rounded-2xl border border-border bg-background p-4">
            <h2 className="text-[15px] font-semibold text-foreground">Resumen</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Fila k={`Piezas (${lineas.reduce((s, l) => s + l.qty, 0)})`} v={formatPrecio(subtotal)} />
              <Fila
                k={entregaResumen}
                v={
                  recoger ? (
                    <span className="font-medium text-green-700">Gratis</span>
                  ) : soloDropship ? (
                    <span className="font-medium text-green-700">Incluido</span>
                  ) : envio ? (
                    formatPrecio(envio.totalCents)
                  ) : (
                    <span className="text-muted-foreground">Por cotizar</span>
                  )
                }
              />
              {apartar && (
                <>
                  <Fila k="Apartado" v={etiqueta ? etiqueta.plazo : "—"} />
                  <Fila k="Pago" v="En sucursal al recoger" />
                </>
              )}
              <div className="flex items-baseline justify-between border-t border-border pt-2.5">
                <dt className="font-semibold text-foreground">Total</dt>
                <dd className="text-xl font-semibold tabular-nums text-foreground">{formatPrecio(total)}</dd>
              </div>
            </dl>

            <div className="mt-4 hidden lg:block">
              {botonConfirmar}
              {avisoBajoBoton}
            </div>

            <ul className="mt-4 space-y-2 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
              {tienda.garantiaDias != null && (
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tienda-600" />
                  {tienda.garantiaDias} días de garantía por defecto de fábrica
                  {tienda.garantiaCondicion ? `, ${tienda.garantiaCondicion}` : ""}.
                </li>
              )}
              {apartar && (
                <li className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tienda-600" />
                  Las guardamos desde que confirmas; si no llegas a tiempo se liberan solas.
                </li>
              )}
            </ul>
          </div>
        </aside>
      </div>

      {/* Phone: total and the button where the thumb is. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden">
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="text-[15px] text-muted-foreground">Total</span>
          <span className="text-[22px] font-semibold tabular-nums text-foreground">{formatPrecio(total)}</span>
        </div>
        {botonConfirmar}
        {avisoBajoBoton}
      </div>
    </div>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</div>;
}

function Seccion({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-background p-4">
      {titulo && <h2 className="mb-3 text-[15px] font-semibold text-foreground">{titulo}</h2>}
      {children}
    </section>
  );
}

function Fila({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0 text-muted-foreground">{k}</dt>
      <dd className="shrink-0 text-right tabular-nums text-foreground">{v}</dd>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  autoComplete,
  placeholder,
  hint,
  list,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: "text" | "tel" | "email" | "numeric";
  autoComplete?: string;
  placeholder?: string;
  hint?: string;
  list?: string;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[13px] font-medium text-muted-foreground">
        {label}
        {hint && <span className="font-normal"> · {hint}</span>}
      </span>
      <input
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        list={list}
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        // 16px text: smaller makes iOS zoom on focus.
        className="h-12 w-full rounded-xl border border-border bg-background px-3 text-base text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-tienda-500 focus:ring-4 focus:ring-tienda-100"
      />
    </label>
  );
}
