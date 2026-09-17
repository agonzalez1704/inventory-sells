"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRightToLine,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  MapPin,
  MessageCircle,
  Store,
  Truck,
  Undo2,
  X,
} from "lucide-react";
import { formatMXN } from "@/lib/money";
import { foto as urlFoto } from "@/lib/foto";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { CuentaChip } from "@/components/ui/cuenta";
import { comprobantesDeOrden, type Comprobante } from "@/modules/sales/comprobantes";
import { avanzarPedido, cancelarPedido, cobrarEnMostrador, confirmarTransferencia, marcarDropshipPedido } from "./actions";
import { EnviarPedido } from "./EnviarPedido";
import { METODO_LABEL, PILL, esDrop, etapaDe, waLink, type ItemPedido, type PedidoWeb } from "./PedidosView";

const TZ = "America/Mexico_City";
const cuando = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const hora = (iso: string) => new Intl.DateTimeFormat("es-MX", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));

const PASOS = ["Pedido", "Pagado", "Preparado", "Entregado"] as const;

/** One order beside the board: what to pick, where it goes, and what's next. */
export function PanelPedido({
  pedido,
  anterior,
  siguiente,
  onNavegar,
  onClose,
  isAdmin,
  dirTienda,
}: {
  pedido: PedidoWeb | null;
  anterior: string | null;
  siguiente: string | null;
  onNavegar: (id: string) => void;
  onClose: () => void;
  isAdmin: boolean;
  dirTienda: string | null;
}) {
  const router = useRouter();
  const [p, setP] = useState(pedido);
  if (pedido && pedido !== p) setP(pedido);
  const [enviando, setEnviando] = useState(false);
  const [listas, setListas] = useState<Set<number>>(new Set());
  const [cancelando, setCancelando] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    setListas(new Set());
    setEnviando(false);
    setCancelando(false);
  }, [p?.id]);

  useEffect(() => {
    if (!pedido) return;
    const tecla = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (enviando || (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName))) return;
      if (e.key === "ArrowLeft" && anterior) onNavegar(anterior);
      else if (e.key === "ArrowRight" && siguiente) onNavegar(siguiente);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [pedido, anterior, siguiente, onNavegar, enviando]);

  function correr(fn: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, exito: string) {
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(exito);
      router.refresh();
    });
  }

  if (!p) {
    return (
      <Drawer open={false} onOpenChange={() => {}} swipeDirection="right">
        <DrawerContent className="data-[swipe-direction=right]:w-[min(640px,100vw)]" />
      </Drawer>
    );
  }

  const recoger = p.tipo_entrega === "recoger";
  const items = p.orden_web_items ?? [];
  const drop = items.filter(esDrop);
  const fisicos = items.filter((i) => !esDrop(i));
  const etapa = etapaDe(p);
  const pagada = p.status === "pagada";
  const pendiente = p.status === "pendiente";
  const hecho = p.entregado_at ? 4 : p.listo_at || p.enviado_at || p.preparado_at ? 3 : pagada ? 2 : 1;

  // What gets pasted into the supplier's checkout, one block, one copy.
  const direccion = recoger
    ? `${p.nombre}\n${dirTienda ?? "Dirección de la tienda (configúrala en Configuración)"}\nTel: ${p.telefono}`
    : [p.nombre, [p.direccion, p.referencias].filter(Boolean).join(", "), `${p.municipio ?? ""}, ${p.estado ?? ""}, CP ${p.cp ?? ""}`, `Tel: ${p.telefono}`].join("\n");

  const mensajeListo = `Hola ${p.nombre}, tu pedido ${p.folio} ya está listo para recoger${p.sucursal ? ` en ${p.sucursal}` : ""}. Solo da tu folio: ${p.folio}.`;

  return (
    <Drawer open={pedido != null} onOpenChange={(o) => !o && onClose()} swipeDirection="right">
      <DrawerContent className="data-[swipe-direction=right]:w-[min(640px,100vw)]">
        <DrawerTitle className="sr-only">Pedido {p.folio}</DrawerTitle>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 sm:px-5">
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar panel">
            <ArrowRightToLine className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
          <a
            href={waLink(p.telefono, `Hola ${p.nombre}, te escribo por tu pedido ${p.folio}.`)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            <MessageCircle className="h-4 w-4 text-emerald-600" />
            WhatsApp
          </a>
          <Link
            href={`/tienda/orden/${p.id}`}
            target="_blank"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
          >
            <ExternalLink className="h-4 w-4" />
            <span className="hidden sm:inline">Página del cliente</span>
          </Link>
          <div className="flex gap-1.5">
            <Button variant="secondary" size="icon" aria-label="Pedido anterior" disabled={!anterior} onClick={() => anterior && onNavegar(anterior)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="icon" aria-label="Pedido siguiente" disabled={!siguiente} onClick={() => siguiente && onNavegar(siguiente)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="font-mono text-sm text-muted-foreground">
                {p.folio} · {cuando(p.created_at)}
              </p>
              <h2 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{p.nombre}</h2>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={PILL.gris}>
                  {recoger ? <Store className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
                  {recoger ? `Recoger${p.sucursal ? ` · ${p.sucursal}` : ""}` : `Envío · ${p.municipio ?? p.cp ?? ""}`}
                </span>
                <span className={p.metodo === "transferencia" && pendiente ? PILL.ambar : PILL.gris}>
                  {p.metodo ? (METODO_LABEL[p.metodo] ?? p.metodo) : "—"}
                  {pagada ? " · pagado" : ""}
                </span>
                {p.cotizacion_folio && <span className={PILL.violeta}>De {p.cotizacion_folio}</span>}
              </div>
            </div>
            <span className="shrink-0 text-2xl font-semibold tabular-nums">{formatMXN(p.total_cents)}</span>
          </div>

          {/* Where it is in its own trail */}
          <ol className="flex items-start">
            {PASOS.map((paso, i) => {
              const label = i === 3 ? (recoger ? "Entregado" : "Entregado") : i === 2 ? (p.enviado_at ? "Enviado" : recoger ? "Listo" : "Preparado") : paso;
              const done = i < hecho;
              const cur = i === hecho;
              const cuandoPaso =
                i === 0 ? hora(p.created_at) : i === 1 && p.paid_at ? hora(p.paid_at) : i === 2 ? (p.enviado_at ? hora(p.enviado_at) : p.listo_at ? hora(p.listo_at) : p.preparado_at ? hora(p.preparado_at) : "") : i === 3 && p.entregado_at ? hora(p.entregado_at) : "";
              return (
                <li key={paso} className="relative flex flex-1 flex-col items-center gap-1.5">
                  {i > 0 && <span className={cn("absolute right-1/2 top-3 h-0.5 w-full", done || cur ? "bg-foreground" : "bg-border")} />}
                  <span
                    className={cn(
                      "relative flex h-6 w-6 items-center justify-center rounded-full border-2 bg-background",
                      done ? "border-foreground bg-foreground text-background" : cur ? "border-foreground" : "border-border",
                    )}
                  >
                    {done && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className={cn("text-center text-xs", cur && "font-semibold", !done && !cur && "text-muted-foreground")}>{label}</span>
                  <span className="text-[11px] text-muted-foreground">{cuandoPaso}</span>
                </li>
              );
            })}
          </ol>

          {/* Pick list */}
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <p className="flex-1 text-[15px] font-semibold">Juntar piezas</p>
              <p className="text-xs text-muted-foreground">
                {listas.size} de {items.length} listas
              </p>
            </div>
            <ul>
              {items.map((it, i) => {
                const marcada = listas.has(i);
                const faltan = !esDrop(it) && it.products?.quantity != null && it.products.quantity < it.qty;
                return (
                  <li key={i} className="flex items-center gap-3 border-t border-border/70 py-2.5">
                    <button
                      type="button"
                      aria-pressed={marcada}
                      aria-label={`Marcar ${it.nombre}`}
                      onClick={() =>
                        setListas((s) => {
                          const n = new Set(s);
                          n.has(i) ? n.delete(i) : n.add(i);
                          return n;
                        })
                      }
                      className={cn(
                        "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-2",
                        marcada ? "border-foreground bg-foreground text-background" : "border-border",
                      )}
                    >
                      {marcada && <Check className="h-4 w-4" />}
                    </button>
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                      {it.products?.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={urlFoto(it.products.image_url, 128)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Camera className="h-4 w-4 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-sm font-semibold", marcada && "line-through opacity-60")}>
                        {it.qty}× {it.nombre}
                      </p>
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <MapPin className={cn("h-3 w-3", esDrop(it) ? "text-muted-foreground/50" : "text-amber-600")} />
                        {esDrop(it)
                          ? `${it.products?.inventories?.name ?? "Proveedor"} · dropship`
                          : `${it.products?.inventories?.name ?? "—"}${it.products?.inventories?.sucursales?.nombre ? ` · ${it.products.inventories.sucursales.nombre}` : ""}${it.products?.quantity != null ? ` · hay ${it.products.quantity}` : ""}`}
                      </p>
                    </div>
                    {faltan && <span className={PILL.rojo}>No alcanza</span>}
                    {esDrop(it) && <span className={PILL.ambar}>Del proveedor</span>}
                  </li>
                );
              })}
            </ul>
          </div>

          {pendiente && p.metodo === "transferencia" && <ComprobantesOrden ordenId={p.id} />}

          {pagada && p.dropship_estado && <BloqueDropship p={p} isAdmin={isAdmin} drop={drop} fisicos={fisicos} direccion={direccion} />}

          {/* Delivery */}
          <div>
            <p className="mb-1.5 text-[15px] font-semibold">{recoger ? "Recoge" : "Entrega"}</p>
            <div className="flex items-start gap-3 rounded-xl border border-border p-3">
              {recoger ? <Store className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
              <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                <p className="font-semibold">{p.nombre}</p>
                {recoger ? (
                  <p className="text-muted-foreground">
                    En {p.sucursal ?? "la tienda"} · {p.telefono}
                  </p>
                ) : (
                  <>
                    <p>{[p.direccion, p.referencias].filter(Boolean).join(", ")}</p>
                    <p className="text-muted-foreground">
                      {p.municipio ?? ""}
                      {p.estado ? `, ${p.estado}` : ""} · CP {p.cp ?? "—"} · {p.telefono}
                    </p>
                  </>
                )}
                {p.guia_numero && (
                  <p className="pt-1 font-mono text-xs">
                    {p.guia_paqueteria} · {p.guia_numero}
                    {p.guia_costo_cents ? ` · costó ${formatMXN(p.guia_costo_cents)}` : ""}
                  </p>
                )}
              </div>
              {!recoger && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(direccion);
                    toast.success("Dirección copiada");
                  }}
                  className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm hover:bg-muted"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar
                </button>
              )}
            </div>
          </div>

          {p.entrega_nota && <p className="text-sm text-muted-foreground">Nota de entrega: {p.entrega_nota}</p>}
        </div>

        {/* What's next */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-6">
          {pendiente ? (
            <>
              {p.metodo === "sucursal" ? (
                <>
                  <Button variant="secondary" className="h-12 flex-1" onClick={() => correr(() => cobrarEnMostrador(p.id, "tarjeta"), `Cobrado · ${p.folio}`)} loading={pending}>
                    Cobré con tarjeta
                  </Button>
                  <Button className="h-12 flex-1" onClick={() => correr(() => cobrarEnMostrador(p.id, "efectivo"), `Cobrado · ${p.folio}`)} loading={pending}>
                    Cobré en efectivo
                  </Button>
                </>
              ) : isAdmin && p.metodo === "transferencia" ? (
                <Button className="h-12 flex-1" onClick={() => correr(() => confirmarTransferencia(p.id), `Pago confirmado · ${p.folio}`)} loading={pending}>
                  <Check className="h-4 w-4" />
                  Confirmar pago recibido
                </Button>
              ) : (
                <p className="flex-1 text-sm text-muted-foreground">Esperando el pago del cliente.</p>
              )}
              {isAdmin &&
                (cancelando ? (
                  <>
                    <Button variant="danger" className="h-12" onClick={() => correr(() => cancelarPedido(p.id), `Cancelado · ${p.folio}`)} loading={pending}>
                      Sí, cancelar y liberar
                    </Button>
                    <Button variant="ghost" className="h-12" onClick={() => setCancelando(false)} disabled={pending}>
                      No
                    </Button>
                  </>
                ) : (
                  <Button variant="ghost" size="icon" className="h-12 w-12" aria-label="Cancelar pedido" onClick={() => setCancelando(true)} disabled={pending}>
                    <X className="h-5 w-5" />
                  </Button>
                ))}
            </>
          ) : pagada ? (
            <>
              {etapa !== "entregado" && (
                <Button variant="ghost" className="h-12" onClick={() => correr(() => avanzarPedido(p.id, "deshacer"), "Un paso atrás")} disabled={pending} aria-label="Deshacer el último paso">
                  <Undo2 className="h-4 w-4" />
                </Button>
              )}
              <div className="flex-1" />
              {etapa === "preparar" && (
                <>
                  {recoger ? (
                    <Button
                      className="h-12 flex-1 sm:flex-none"
                      onClick={() =>
                        start(async () => {
                          const r = await avanzarPedido(p.id, "listo");
                          if (!r.ok) {
                            toast.error(r.error);
                            return;
                          }
                          toast.success(`${p.folio} listo para recoger`, {
                            action: { label: "Avisar", onClick: () => window.open(waLink(p.telefono, mensajeListo), "_blank") },
                          });
                          router.refresh();
                        })
                      }
                      loading={pending}
                    >
                      <Check className="h-4 w-4" />
                      Listo para recoger
                    </Button>
                  ) : (
                    <Button className="h-12 flex-1 sm:flex-none" onClick={() => setEnviando(true)}>
                      <Truck className="h-4 w-4" />
                      Enviar con guía
                    </Button>
                  )}
                </>
              )}
              {etapa === "listo" && (
                <Button className="h-12 flex-1 sm:flex-none" onClick={() => correr(() => avanzarPedido(p.id, "entregado"), `${p.folio} entregado`)} loading={pending}>
                  <Check className="h-4 w-4" />
                  {recoger ? "Ya lo recogieron" : "Llegó al cliente"}
                </Button>
              )}
              {etapa === "entregado" && (
                <p className="text-sm text-muted-foreground">
                  Entregado {p.entregado_at ? cuando(p.entregado_at) : ""}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {p.status === "expirada" ? "El apartado venció y las piezas volvieron a la venta." : "Pedido cancelado: el stock ya se liberó."}
            </p>
          )}
        </div>

        {pagada && !recoger && <EnviarPedido open={enviando} pedido={p} onClose={() => setEnviando(false)} />}
      </DrawerContent>
    </Drawer>
  );
}

/** Split one paid order into its two shipments and drive the supplier one. */
function BloqueDropship({
  p,
  isAdmin,
  drop,
  fisicos,
  direccion,
}: {
  p: PedidoWeb;
  isAdmin: boolean;
  drop: ItemPedido[];
  fisicos: ItemPedido[];
  direccion: string;
}) {
  const router = useRouter();
  const [ref, setRef] = useState("");
  const [pending, start] = useTransition();

  if (p.dropship_estado === "pedido")
    return (
      <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
        <Check className="h-4 w-4" />
        Pedido al proveedor · <span className="font-mono font-semibold">{p.dropship_ref}</span>
        {fisicos.length > 0 && " — lo de la tienda se envía aparte."}
      </p>
    );

  return (
    <div className="space-y-2 rounded-xl border border-amber-300/60 bg-amber-50 p-3.5 dark:border-amber-800 dark:bg-amber-950/30">
      {p.dropship_estado === "pidiendo" && (
        <p className="text-xs text-muted-foreground">Pidiendo a AliExpress automáticamente… si no cambia en un minuto, pídelo a mano aquí.</p>
      )}
      <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Pedir al proveedor · con el dinero ya cobrado</p>
      <ul className="space-y-1 text-sm">
        {drop.map((i, idx) => (
          <li key={idx}>
            {i.qty}× {i.nombre}
            {i.products?.enlace_proveedor && (
              <a href={i.products.enlace_proveedor} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-amber-800 underline dark:text-amber-300">
                Abrir en proveedor <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </li>
        ))}
      </ul>
      <div className="rounded-lg border border-amber-300/50 bg-background/60 p-2">
        <p className="whitespace-pre-line font-mono text-xs">{direccion}</p>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(direccion);
            toast.success("Dirección copiada");
          }}
          className="mt-1.5 cursor-pointer text-xs font-medium text-amber-800 hover:underline dark:text-amber-300"
        >
          Copiar dirección de entrega
        </button>
      </div>
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Núm. de orden del proveedor" className="h-9 max-w-56" />
          <Button
            size="sm"
            loading={pending}
            disabled={!ref.trim()}
            onClick={() =>
              start(async () => {
                const r = await marcarDropshipPedido(p.id, ref);
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success(`Pedido al proveedor registrado · ${p.folio}`);
                router.refresh();
              })
            }
          >
            <Check className="h-4 w-4" />
            Marcar pedido
          </Button>
        </div>
      )}
    </div>
  );
}

/** The customer's uploaded transfer proof, right where the admin confirms it. */
function ComprobantesOrden({ ordenId }: { ordenId: string }) {
  const [rows, setRows] = useState<Comprobante[]>([]);
  useEffect(() => {
    let on = true;
    comprobantesDeOrden(ordenId)
      .then((r) => on && setRows(r))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [ordenId]);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
      <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">El cliente ya envió su comprobante</p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 text-xs">
            {c.cuenta && <CuentaChip cuenta={c.cuenta} />}
            {c.referencia && <span className="font-mono">{c.referencia}</span>}
            {c.imagen_url && (
              <a href={c.imagen_url} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
                Ver captura
              </a>
            )}
            <span className="text-muted-foreground">{cuando(c.created_at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
