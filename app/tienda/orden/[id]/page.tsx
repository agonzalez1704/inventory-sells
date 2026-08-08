import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Clock, Store, ArrowLeftRight, XCircle, Landmark } from "lucide-react";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { getConektaOrder } from "@/lib/conekta";
import { formatMXN } from "@/lib/money";
import { getTiendaInfo } from "@/modules/config/lib";
import { VOUCHER_HORAS_UI } from "@/modules/tienda/pago-const";
import { PasePickup } from "@/modules/tienda/PasePickup";
import { MARCA } from "@/lib/marca";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: `Tu pedido — ${MARCA.tienda.nombre}`, robots: { index: false } };

type Orden = {
  id: string;
  folio: string;
  nombre: string;
  status: string;
  metodo: string | null;
  conekta_order_id: string | null;
  subtotal_cents: number;
  envio_cents: number;
  total_cents: number;
  envio_desc: string | null;
  tipo_entrega: string;
  direccion: string | null;
  municipio: string | null;
  estado: string | null;
  cp: string | null;
};

// Store's receiving account for direct transfers. In env, not committed — it's
// shared with the customer on the confirmation page. Absent → we tell them we'll
// send the data by WhatsApp instead of showing a blank.
const BANK = {
  titular: process.env.BANK_TITULAR ?? null,
  banco: process.env.BANK_BANCO ?? null,
  clabe: process.env.BANK_CLABE ?? null,
};

// The order id is an unguessable uuid, which is what gates this page — there are
// no customer accounts. It shows only what the buyer already gave us.
export default async function OrdenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tienda = await getTiendaInfo();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data } = await insforgeAdmin.database
    .from("ordenes_web")
    .select(
      "id, folio, nombre, status, metodo, conekta_order_id, subtotal_cents, envio_cents, total_cents, envio_desc, tipo_entrega, direccion, municipio, estado, cp",
    )
    .eq("id", id)
    .maybeSingle();
  const o = data as Orden | null;
  if (!o) notFound();

  const { data: itemsData } = await insforgeAdmin.database
    .from("orden_web_items")
    .select("nombre, qty, unit_price_cents")
    .eq("orden_id", id);
  const items = (itemsData ?? []) as { nombre: string; qty: number; unit_price_cents: number }[];

  // Voucher details live at Conekta, not in our DB — fetch them for display.
  let referencia: string | null = null;
  let clabe: string | null = null;
  let banco: string | null = null;
  if (o.status === "pendiente" && o.conekta_order_id) {
    try {
      const co = await getConektaOrder(o.conekta_order_id);
      const pm = co.charges?.data?.[0]?.payment_method;
      referencia = pm?.reference ?? null;
      clabe = pm?.receiving_account_number ?? null;
      banco = pm?.receiving_account_bank ?? null;
    } catch {
      // Conekta down -> still show the order, just without the voucher.
    }
  }

  const pagada = o.status === "pagada";
  const cancelada = o.status === "cancelada";
  const recoger = o.tipo_entrega === "recoger";
  const esTransferencia = o.metodo === "transferencia";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-border bg-background p-6">
        <div className="flex items-center gap-3">
          <span
            className={
              pagada
                ? "flex h-11 w-11 items-center justify-center rounded-xl bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300"
                : cancelada
                  ? "flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-muted-foreground"
                  : "flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
            }
          >
            {pagada ? <CheckCircle2 className="h-6 w-6" /> : cancelada ? <XCircle className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground [font-family:var(--font-display)]">
              {pagada ? "¡Pago confirmado!" : cancelada ? "Pedido cancelado" : "Pedido apartado"}
            </h1>
            <p className="text-xs text-muted-foreground">Folio {o.folio}</p>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {pagada ? (
            recoger ? (
              <>Gracias, {o.nombre.split(" ")[0]}. Tu pedido está listo para recoger. Ven tú o manda tu Uber/mensajero — solo dan el folio <strong>{o.folio}</strong> al llegar.</>
            ) : (
              <>Gracias, {o.nombre.split(" ")[0]}. Preparamos tu envío y te contactamos por WhatsApp con tu guía.{tienda.entregaDias ? ` Entrega en ${tienda.entregaDias} hábiles.` : ""}</>
            )
          ) : cancelada ? (
            <>Este pedido se canceló y los productos volvieron al catálogo. Si fue un error, vuelve a intentarlo o escríbenos.</>
          ) : recoger ? (
            <>Apartamos tus piezas. En cuanto confirmemos tu pago queda listo para recoger — recibirás aviso por WhatsApp.</>
          ) : (
            <>Apartamos tus piezas. En cuanto confirmemos tu pago preparamos el envío — recibirás aviso por WhatsApp.</>
          )}
        </p>

        {/* Voucher */}
        {!pagada && !cancelada && referencia && (
          <div className="mt-5 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/40 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
              <Store className="h-4 w-4" /> Paga en cualquier OXXO
            </p>
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">Referencia</p>
            <p className="select-all font-mono text-xl font-bold tracking-wider text-amber-950 dark:text-amber-200">
              {referencia}
            </p>
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
              Monto: <strong>{formatMXN(o.total_cents)}</strong> · vence en {VOUCHER_HORAS_UI} h
            </p>
          </div>
        )}
        {!pagada && !cancelada && clabe && (
          <div className="mt-5 rounded-xl border border-tienda-200 dark:border-tienda-900 bg-tienda-50/60 dark:bg-tienda-950/40 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-tienda-900 dark:text-tienda-200">
              <ArrowLeftRight className="h-4 w-4" /> Transferencia SPEI
            </p>
            <p className="mt-2 text-xs text-tienda-800 dark:text-tienda-300">CLABE {banco ? `· ${banco}` : ""}</p>
            <p className="select-all font-mono text-xl font-bold tracking-wider text-tienda-950 dark:text-tienda-200">
              {clabe}
            </p>
            <p className="mt-2 text-xs text-tienda-800 dark:text-tienda-300">
              Monto exacto: <strong>{formatMXN(o.total_cents)}</strong> · vence en {VOUCHER_HORAS_UI} h
            </p>
          </div>
        )}

        {/* Direct bank transfer: our own account, confirmed by staff. */}
        {!pagada && !cancelada && esTransferencia && (
          <div className="mt-5 rounded-xl border border-tienda-200 dark:border-tienda-900 bg-tienda-50/60 dark:bg-tienda-950/40 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-tienda-900 dark:text-tienda-200">
              <Landmark className="h-4 w-4" /> Transfiere a nuestra cuenta
            </p>
            {BANK.clabe ? (
              <div className="mt-2 space-y-1.5 text-sm text-tienda-950 dark:text-tienda-200">
                {BANK.banco && <p className="text-xs text-tienda-800 dark:text-tienda-300">{BANK.banco}</p>}
                <p className="select-all font-mono text-xl font-bold tracking-wider">{BANK.clabe}</p>
                {BANK.titular && <p className="text-xs text-tienda-800 dark:text-tienda-300">A nombre de {BANK.titular}</p>}
              </div>
            ) : (
              <p className="mt-2 text-xs text-tienda-800 dark:text-tienda-300">
                Te enviamos los datos de la cuenta por WhatsApp.
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-tienda-800 dark:text-tienda-300">
              Monto exacto: <strong>{formatMXN(o.total_cents)}</strong>. Manda tu
              comprobante por WhatsApp y apartamos tu pedido; lo preparamos en
              cuanto confirmemos el depósito. Referencia: <strong>{o.folio}</strong>.
            </p>
          </div>
        )}

        {/* Detalle */}
        <ul className="mt-5 divide-y divide-border border-t border-border pt-2">
          {items.map((i, n) => (
            <li key={n} className="flex justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-foreground">
                {i.qty} × {i.nombre}
              </span>
              <span className="shrink-0 tabular-nums text-foreground">
                {formatMXN(i.unit_price_cents * i.qty)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 space-y-1 border-t border-border pt-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tabular-nums">{formatMXN(o.subtotal_cents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">{recoger ? "Entrega" : `Envío${o.envio_desc ? ` · ${o.envio_desc}` : ""}`}</dt>
            <dd className="tabular-nums">
              {recoger ? <span className="text-green-700 dark:text-green-300">Recoger · gratis</span> : formatMXN(o.envio_cents)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-border pt-1.5">
            <dt className="font-semibold text-foreground">Total</dt>
            <dd className="text-lg font-semibold tabular-nums text-tienda-800 dark:text-tienda-300">
              {formatMXN(o.total_cents)}
            </dd>
          </div>
        </dl>

        {recoger ? (
          <PasePickup folio={o.folio} pagada={pagada} />
        ) : (
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Enviamos a: {o.direccion}, {o.municipio}, {o.estado}, CP {o.cp}
          </p>
        )}

        <Link
          href="/tienda"
          className="mt-5 inline-flex h-11 items-center rounded-xl border border-border px-4 text-sm font-medium text-foreground transition-colors hover:border-tienda-300 dark:border-tienda-800 hover:text-tienda-700 dark:text-tienda-300"
        >
          Volver al catálogo
        </Link>
      </div>
    </div>
  );
}
