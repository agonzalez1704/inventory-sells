"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Send, Check, ShoppingCart, X, Pencil, UserCog, Hand, Copy, MessageCircle } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import {
  enviarCotizacion,
  autorizarCotizacion,
  convertirCotizacion,
  cancelarCotizacion,
  asignarCotizacion,
  reclamarCotizacion,
} from "./actions";

export type CotItem = {
  nombre: string;
  sku: string | null;
  qty: number;
  unit_price_cents: number;
  cost_cents: number;
  line_total_cents: number;
};

export type CotDetalle = {
  id: string;
  folio: string;
  estado: string;
  canal: string;
  cliente: string;
  vendedor: string | null;
  vendedor_id: string | null;
  subtotal_cents: number;
  total_cents: number;
  notas: string | null;
  created_at: string;
  expires_at: string | null;
  autorizada_at: string | null;
  sale_id: string | null;
  cancel_motivo: string | null;
  share_token: string;
};

type Tone = "neutral" | "success" | "warning" | "danger" | "accent";

function estadoMeta(c: CotDetalle): { label: string; tone: Tone } {
  if (c.estado === "pendiente" && c.expires_at && new Date(c.expires_at) < new Date())
    return { label: "Vencida", tone: "danger" };
  const map: Record<string, { label: string; tone: Tone }> = {
    borrador: { label: "Borrador", tone: "neutral" },
    pendiente: { label: "Pendiente", tone: "warning" },
    autorizada: { label: "Autorizada", tone: "accent" },
    convertida: { label: "Convertida", tone: "success" },
    cancelada: { label: "Cancelada", tone: "neutral" },
  };
  return map[c.estado] ?? { label: c.estado, tone: "neutral" };
}

function fechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CotizacionDetalle({
  cot,
  items,
  perms,
  vendedores,
}: {
  cot: CotDetalle;
  items: CotItem[];
  perms: {
    editar: boolean;
    autorizar: boolean;
    convertir: boolean;
    reasignar: boolean;
    reclamar: boolean;
    costos: boolean;
  };
  vendedores: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [convertOpen, setConvertOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [asignado, setAsignado] = useState(cot.vendedor_id ?? "");
  const [copied, setCopied] = useState(false);

  const est = estadoMeta(cot);
  const terminal = cot.estado === "convertida" || cot.estado === "cancelada";
  const editable = cot.estado === "borrador" || cot.estado === "pendiente";
  // Public accept link — live once sent (pendiente) and while authorized.
  const compartible = cot.estado === "pendiente" || cot.estado === "autorizada";
  const base = process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");
  // Token in the URL fragment (#) — the browser never sends it to the server,
  // so it stays out of logs / Referer / link previews.
  const shareUrl = `${base}/cotizacion#${cot.share_token}`;
  const waHref = `https://wa.me/?text=${encodeURIComponent(
    `Hola, aquí está tu cotización ${cot.folio} por ${formatMXN(cot.total_cents)}. Ábrela y autorízala aquí: ${shareUrl}`,
  )}`;

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("No se pudo copiar");
    }
  }
  const margen = cot.total_cents - items.reduce((s, i) => s + i.cost_cents * i.qty, 0);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Error");
        return;
      }
      toast.success(okMsg);
      router.refresh();
    });
  }

  function convertir() {
    startTransition(async () => {
      const res = await convertirCotizacion(cot.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setConvertOpen(false);
      toast.success("Venta a crédito generada");
      router.refresh();
    });
  }

  return (
    <section className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link
          href="/cotizaciones"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Cotizaciones
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">{cot.folio}</h1>
          <Badge tone={est.tone}>{est.label}</Badge>
        </div>
      </div>

      {/* Meta */}
      <Card className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm sm:grid-cols-3">
        <Meta label="Cliente" value={cot.cliente} />
        <Meta label="Vendedor" value={cot.vendedor ?? "Sin asignar"} />
        <Meta label="Canal" value={cot.canal} />
        <Meta label="Creada" value={fechaHora(cot.created_at)} />
        {cot.expires_at && <Meta label="Vigencia" value={fechaHora(cot.expires_at)} />}
        {cot.autorizada_at && <Meta label="Autorizada" value={fechaHora(cot.autorizada_at)} />}
      </Card>

      {compartible && (
        <Card className="space-y-3 p-4">
          <div>
            <p className="text-sm font-medium">Compartir con el cliente</p>
            <p className="text-xs text-muted-foreground">
              Enlace público para que el cliente vea y autorice la cotización él mismo.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input readOnly value={shareUrl} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button variant="secondary" onClick={copiarLink}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <Button asChild variant="primary" className="bg-green-600 hover:bg-green-700">
            <a href={waHref} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-4 w-4" /> Enviar por WhatsApp
            </a>
          </Button>
        </Card>
      )}

      {cot.notas && (
        <Card className="p-4 text-sm">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Notas</p>
          <p>{cot.notas}</p>
        </Card>
      )}

      {cot.estado === "cancelada" && cot.cancel_motivo && (
        <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300">
          <span className="font-medium">Cancelada:</span> {cot.cancel_motivo}
        </div>
      )}

      {cot.sale_id && (
        <Link
          href={`/fiados?fiado=${cot.sale_id}`}
          className="flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-sm text-emerald-800 dark:text-emerald-300 transition-colors hover:bg-emerald-100 dark:bg-emerald-900/40"
        >
          <ShoppingCart className="h-4 w-4" /> Venta a crédito generada. Se cobra y concilia en Notas de crédito →
        </Link>
      )}

      {/* Items */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Producto</th>
                <th className="px-2 py-2.5 text-right font-medium">Cant.</th>
                <th className="px-2 py-2.5 text-right font-medium">Precio</th>
                <th className="px-4 py-2.5 text-right font-medium">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{it.nombre}</p>
                    {it.sku && <p className="text-xs text-muted-foreground">{it.sku}</p>}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{it.qty}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatMXN(it.unit_price_cents)}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                    {formatMXN(it.line_total_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td colSpan={3} className="px-4 py-3 text-right text-sm font-medium">
                  Total
                </td>
                <td className="px-4 py-3 text-right font-mono text-lg font-semibold tabular-nums">
                  {formatMXN(cot.total_cents)}
                </td>
              </tr>
              {perms.costos && (
                <tr className="text-xs text-muted-foreground">
                  <td colSpan={3} className="px-4 pb-3 text-right">
                    Margen estimado
                  </td>
                  <td className="px-4 pb-3 text-right tabular-nums">{formatMXN(margen)}</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </Card>

      {/* Reassign */}
      {perms.reasignar && !terminal && vendedores.length > 0 && (
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Asignar vendedor
            </label>
            <select
              value={asignado}
              onChange={(e) => setAsignado(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="">Sin asignar</option>
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="secondary"
            onClick={() => run(() => asignarCotizacion(cot.id, asignado), "Vendedor asignado")}
            disabled={pending || asignado === (cot.vendedor_id ?? "")}
          >
            <UserCog className="h-4 w-4" /> Asignar
          </Button>
        </Card>
      )}

      {/* State actions */}
      {!terminal && (
        <div className="flex flex-wrap gap-2">
          {perms.reclamar && cot.vendedor_id === null && (
            <Button
              variant="primary"
              onClick={() => run(() => reclamarCotizacion(cot.id), "Cotización tomada")}
              loading={pending}
            >
              <Hand className="h-4 w-4" /> Tomar cotización
            </Button>
          )}
          {perms.editar && editable && (
            <Button asChild variant="secondary">
              <Link href={`/cotizaciones/${cot.id}/editar`}>
                <Pencil className="h-4 w-4" /> Editar
              </Link>
            </Button>
          )}
          {perms.editar && cot.estado === "borrador" && (
            <Button
              variant="primary"
              onClick={() => run(() => enviarCotizacion(cot.id), "Cotización enviada")}
              loading={pending}
            >
              <Send className="h-4 w-4" /> Enviar
            </Button>
          )}
          {perms.autorizar && cot.estado === "pendiente" && (
            <Button
              variant="accent"
              onClick={() => run(() => autorizarCotizacion(cot.id), "Cotización autorizada")}
              loading={pending}
            >
              <Check className="h-4 w-4" /> Autorizar
            </Button>
          )}
          {perms.convertir && cot.estado === "autorizada" && (
            <Button variant="accent" onClick={() => setConvertOpen(true)} disabled={pending}>
              <ShoppingCart className="h-4 w-4" /> Marcar venta (crédito)
            </Button>
          )}
          {perms.editar && (
            <Button
              variant="ghost"
              className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:bg-red-950/40 hover:text-red-700 dark:text-red-300"
              onClick={() => setCancelOpen(true)}
              disabled={pending}
            >
              <X className="h-4 w-4" /> Cancelar
            </Button>
          )}
        </div>
      )}

      <Modal open={convertOpen} onClose={() => setConvertOpen(false)} title="Marcar como venta">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Se genera una <span className="font-medium text-foreground">venta a crédito</span> por{" "}
            <span className="font-medium text-foreground">{formatMXN(cot.total_cents)}</span>. El producto
            sale y baja del inventario; el cobro se concilia después en caja con el folio{" "}
            <span className="font-mono">{cot.folio}</span>.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConvertOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="accent" loading={pending} onClick={convertir}>
              <ShoppingCart className="h-4 w-4" /> Confirmar venta a crédito
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancelar cotización">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            La cotización quedará cancelada. Opcional: indica el motivo.
          </p>
          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCancelOpen(false)} disabled={pending}>
              Volver
            </Button>
            <Button
              variant="danger"
              loading={pending}
              onClick={() =>
                run(() => cancelarCotizacion(cot.id, motivo), "Cotización cancelada")
              }
            >
              Cancelar cotización
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 truncate capitalize")}>{value}</p>
    </div>
  );
}
