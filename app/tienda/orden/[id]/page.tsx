import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Clock, Store, ArrowLeftRight, XCircle } from "lucide-react";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { getConektaOrder } from "@/lib/conekta";
import { formatMXN } from "@/lib/money";
import { TIENDA } from "@/lib/tienda-info";
import { VOUCHER_HORAS_UI } from "@/modules/tienda/pago-const";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tu pedido — Lead Displays", robots: { index: false } };

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
  direccion: string;
  municipio: string;
  estado: string;
  cp: string;
};

// The order id is an unguessable uuid, which is what gates this page — there are
// no customer accounts. It shows only what the buyer already gave us.
export default async function OrdenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data } = await insforgeAdmin.database
    .from("ordenes_web")
    .select(
      "id, folio, nombre, status, metodo, conekta_order_id, subtotal_cents, envio_cents, total_cents, envio_desc, direccion, municipio, estado, cp",
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <span
            className={
              pagada
                ? "flex h-11 w-11 items-center justify-center rounded-xl bg-green-100 text-green-700"
                : cancelada
                  ? "flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500"
                  : "flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-700"
            }
          >
            {pagada ? <CheckCircle2 className="h-6 w-6" /> : cancelada ? <XCircle className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-slate-900 [font-family:var(--font-display)]">
              {pagada ? "¡Pago confirmado!" : cancelada ? "Pedido cancelado" : "Pedido apartado"}
            </h1>
            <p className="text-xs text-slate-500">Folio {o.folio}</p>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          {pagada ? (
            <>Gracias, {o.nombre.split(" ")[0]}. Preparamos tu envío y te contactamos por WhatsApp con tu guía. Entrega en {TIENDA.entregaDias} hábiles.</>
          ) : cancelada ? (
            <>Este pedido se canceló y los productos volvieron al catálogo. Si fue un error, vuelve a intentarlo o escríbenos.</>
          ) : (
            <>Apartamos tus piezas. En cuanto confirmemos tu pago preparamos el envío — recibirás aviso por WhatsApp.</>
          )}
        </p>

        {/* Voucher */}
        {!pagada && !cancelada && referencia && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <Store className="h-4 w-4" /> Paga en cualquier OXXO
            </p>
            <p className="mt-2 text-xs text-amber-800">Referencia</p>
            <p className="select-all font-mono text-xl font-bold tracking-wider text-amber-950">
              {referencia}
            </p>
            <p className="mt-2 text-xs text-amber-800">
              Monto: <strong>{formatMXN(o.total_cents)}</strong> · vence en {VOUCHER_HORAS_UI} h
            </p>
          </div>
        )}
        {!pagada && !cancelada && clabe && (
          <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-blue-900">
              <ArrowLeftRight className="h-4 w-4" /> Transferencia SPEI
            </p>
            <p className="mt-2 text-xs text-blue-800">CLABE {banco ? `· ${banco}` : ""}</p>
            <p className="select-all font-mono text-xl font-bold tracking-wider text-blue-950">
              {clabe}
            </p>
            <p className="mt-2 text-xs text-blue-800">
              Monto exacto: <strong>{formatMXN(o.total_cents)}</strong> · vence en {VOUCHER_HORAS_UI} h
            </p>
          </div>
        )}

        {/* Detalle */}
        <ul className="mt-5 divide-y divide-slate-100 border-t border-slate-200 pt-2">
          {items.map((i, n) => (
            <li key={n} className="flex justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-slate-700">
                {i.qty} × {i.nombre}
              </span>
              <span className="shrink-0 tabular-nums text-slate-900">
                {formatMXN(i.unit_price_cents * i.qty)}
              </span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 space-y-1 border-t border-slate-200 pt-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-600">Subtotal</dt>
            <dd className="tabular-nums">{formatMXN(o.subtotal_cents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-600">Envío{o.envio_desc ? ` · ${o.envio_desc}` : ""}</dt>
            <dd className="tabular-nums">{formatMXN(o.envio_cents)}</dd>
          </div>
          <div className="flex items-baseline justify-between border-t border-slate-200 pt-1.5">
            <dt className="font-semibold text-slate-900">Total</dt>
            <dd className="text-lg font-semibold tabular-nums text-blue-800">
              {formatMXN(o.total_cents)}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Enviamos a: {o.direccion}, {o.municipio}, {o.estado}, CP {o.cp}
        </p>

        <Link
          href="/tienda"
          className="mt-5 inline-flex h-11 items-center rounded-xl border border-slate-200 px-4 text-sm font-medium text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700"
        >
          Volver al catálogo
        </Link>
      </div>
    </div>
  );
}
