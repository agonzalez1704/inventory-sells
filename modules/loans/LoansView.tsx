"use client";

import { useEffect, useMemo, useState } from "react";
import { HandCoins, MessageCircle, Printer, Search, User } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { imprimirTicketNavegador } from "@/lib/ticket";
import type { PickerCustomer } from "@/modules/customers/CustomerPicker";
import type { SwapProduct } from "@/modules/sales/ItemSwapModal";
import { PanelNota } from "./PanelNota";
import { CobrarPanel } from "./CobrarPanel";
import {
  quienDebe,
  resta as restaDe,
  textoRecordatorio,
  ticketDeNota,
  waLink,
  type PieNota,
} from "./estado-cuenta";

export type { SwapProduct };

type LoanItem = {
  product_id: string | null;
  qty: number;
  unit_price_cents?: number | null;
  products: { name: string; sku: string } | null;
};
export type Abono = {
  id: string;
  monto_cents: number;
  metodo: string | null;
  created_at: string;
  /** Who took the money — the counter asks this more than any other question. */
  quien: string | null;
};
export type Loan = {
  id: string;
  total_cents: number;
  note: string | null;
  created_at: string;
  sale_items: LoanItem[];
  pagado_cents: number;
  abonos: Abono[];
  vendedor: string | null;
  cliente: PickerCustomer | null;
  credito_dias: number | null;
  fiado_publico?: boolean;
};

const DIA = 86_400_000;
const diasDe = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / DIA);

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });

const edad = (dias: number) => (dias === 0 ? "hoy" : dias === 1 ? "ayer" : `${dias} días`);

type Filtro = "todas" | "vencidas" | "abonos" | "sin-cliente";

/**
 * The debt book, read the way the counter reads it: oldest first, the amount
 * still owed in the big type, and the three things anyone does with a note —
 * collect it, take something on account, or hand over the ticket again.
 */
export function LoansView({
  loans,
  customers,
  abrirId,
  esAdmin = false,
  comprobanteObligatorio = false,
  pie,
  cobradoSemana = 0,
}: {
  loans: Loan[];
  customers: PickerCustomer[];
  abrirId?: string | null;
  esAdmin?: boolean;
  comprobanteObligatorio?: boolean;
  /** Header and warranty text for anything this screen prints. */
  pie: PieNota;
  /** Collected in the last 7 days, for the header. */
  cobradoSemana?: number;
}) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [panel, setPanel] = useState<Loan | null>(null);
  const [cobrar, setCobrar] = useState<Loan | null>(null);

  // Deep link from a push notification.
  useEffect(() => {
    if (!abrirId) return;
    const l = loans.find((x) => x.id === abrirId);
    if (l) setPanel(l);
  }, [abrirId, loans]);

  // The open panel has to follow a refresh, or an abono leaves it showing the
  // old balance.
  useEffect(() => {
    setPanel((p) => (p ? (loans.find((l) => l.id === p.id) ?? null) : null));
    setCobrar((c) => (c ? (loans.find((l) => l.id === c.id) ?? null) : null));
  }, [loans]);

  const porCobrar = loans.reduce((s, l) => s + restaDe(l), 0);
  const vencidas = loans.filter((l) => diasDe(l.created_at) >= 15);
  const vencidoCents = vencidas.reduce((s, l) => s + restaDe(l), 0);
  const sinCliente = loans.filter((l) => !l.cliente || l.cliente.is_system);

  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return loans.filter((l) => {
      if (filtro === "vencidas" && diasDe(l.created_at) < 15) return false;
      if (filtro === "abonos" && l.pagado_cents === 0) return false;
      if (filtro === "sin-cliente" && l.cliente && !l.cliente.is_system) return false;
      if (!texto) return true;
      const hay = `${l.note ?? ""} ${l.cliente?.nombre ?? ""} ${l.cliente?.telefono ?? ""} ${l.vendedor ?? ""} ${l.sale_items
        .map((i) => i.products?.name ?? "")
        .join(" ")}`.toLowerCase();
      return hay.includes(texto);
    });
  }, [loans, q, filtro]);

  // A debtor with several open notes is one person owing one amount: their
  // notes travel together so nobody collects one and misses the others.
  const grupos = useMemo(() => {
    const porCliente = new Map<string, Loan[]>();
    const sueltas: Loan[] = [];
    for (const l of visibles) {
      const id = l.cliente && !l.cliente.is_system ? l.cliente.id : null;
      if (!id) sueltas.push(l);
      else porCliente.set(id, [...(porCliente.get(id) ?? []), l]);
    }
    const out: { key: string; nombre: string; notas: Loan[] }[] = [];
    for (const [id, notas] of porCliente) {
      if (notas.length === 1) sueltas.push(notas[0]);
      else out.push({ key: id, nombre: notas[0].cliente?.nombre ?? "Cliente", notas });
    }
    for (const l of sueltas) out.push({ key: l.id, nombre: quienDebe(l), notas: [l] });
    return out.sort(
      (a, b) => new Date(a.notas[0].created_at).getTime() - new Date(b.notas[0].created_at).getTime(),
    );
  }, [visibles]);

  const hermanasDe = (l: Loan) =>
    l.cliente && !l.cliente.is_system ? loans.filter((x) => x.cliente?.id === l.cliente?.id && x.id !== l.id) : [];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notas de crédito</h1>
          <p className="mt-1 text-sm text-muted-foreground">Lo que te deben, de lo más viejo a lo más nuevo.</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Kpi label="Por cobrar" valor={porCobrar} />
          <Kpi label="Más de 15 días" valor={vencidoCents} tono="rojo" />
          <Kpi label="Cobrado esta semana" valor={cobradoSemana} tono="verde" />
        </div>
      </div>

      {loans.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="Nadie te debe nada"
          description="Cuando vendas a crédito, la nota aparece aquí para cobrarla después."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-60 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Busca por nombre, seña, teléfono, pieza o vendedor…"
                className="h-11 pl-9"
              />
            </div>
            {(
              [
                ["todas", "Todas", loans.length],
                ["vencidas", "Vencidas", vencidas.length],
                ["abonos", "Con abonos", loans.filter((l) => l.pagado_cents > 0).length],
                ["sin-cliente", "Sin cliente", sinCliente.length],
              ] as const
            ).map(([k, label, n]) => (
              <button
                key={k}
                type="button"
                aria-pressed={filtro === k}
                onClick={() => setFiltro(filtro === k ? "todas" : (k as Filtro))}
                className={cn(
                  "inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-sm",
                  filtro === k ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                )}
              >
                {label} <b className="tabular-nums">{n}</b>
              </button>
            ))}
          </div>

          {sinCliente.length > 0 && filtro !== "sin-cliente" && (
            <button
              type="button"
              onClick={() => setFiltro("sin-cliente")}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left dark:border-amber-900 dark:bg-amber-950/30"
            >
              <User className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
              <span className="flex-1 text-sm text-amber-900 dark:text-amber-200">
                {sinCliente.length} {sinCliente.length === 1 ? "nota está" : "notas están"} a nombre de Mostrador, con una
                seña escrita a mano. Quien no hizo la venta no sabe a quién cobrarle.
              </span>
              <span className="shrink-0 text-sm font-medium text-amber-900 underline underline-offset-2 dark:text-amber-200">
                Verlas
              </span>
            </button>
          )}

          {grupos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nada coincide con esa búsqueda.</p>
          ) : (
            <div className="space-y-2.5">
              {grupos.map((g) =>
                g.notas.length === 1 ? (
                  <FilaNota
                    key={g.key}
                    loan={g.notas[0]}
                    pie={pie}
                    onAbrir={() => setPanel(g.notas[0])}
                    onCobrar={() => setCobrar(g.notas[0])}
                  />
                ) : (
                  <Grupo key={g.key} nombre={g.nombre} notas={g.notas} pie={pie} onAbrir={setPanel} onCobrar={setCobrar} />
                ),
              )}
            </div>
          )}
        </>
      )}

      <PanelNota
        loan={panel}
        hermanas={panel ? hermanasDe(panel) : []}
        customers={customers}
        pie={pie}
        esAdmin={esAdmin}
        comprobanteObligatorio={comprobanteObligatorio}
        onClose={() => setPanel(null)}
      />

      {cobrar && (
        <CobrarPanel
          open
          loan={cobrar}
          pie={pie}
          comprobanteObligatorio={comprobanteObligatorio}
          onClose={() => setCobrar(null)}
          onListo={() => setCobrar(null)}
        />
      )}
    </section>
  );
}

function Kpi({ label, valor, tono = "normal" }: { label: string; valor: number; tono?: "normal" | "rojo" | "verde" }) {
  return (
    <div
      className={cn(
        "min-w-40 rounded-xl border px-4 py-2.5",
        tono === "rojo"
          ? "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20"
          : tono === "verde"
            ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20"
            : "border-border bg-background",
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tono === "rojo" && "text-red-700 dark:text-red-400",
          tono === "verde" && "text-emerald-700 dark:text-emerald-400",
        )}
      >
        {formatMXN(valor)}
      </p>
    </div>
  );
}

function FilaNota({
  loan,
  pie,
  onAbrir,
  onCobrar,
  compacta = false,
}: {
  loan: Loan;
  pie: PieNota;
  onAbrir: () => void;
  onCobrar: () => void;
  compacta?: boolean;
}) {
  const dias = diasDe(loan.created_at);
  const falta = restaDe(loan);
  const pct = loan.total_cents > 0 ? Math.min(100, Math.round((loan.pagado_cents / loan.total_cents) * 100)) : 0;
  const sinCliente = !loan.cliente || loan.cliente.is_system;
  const tel = loan.cliente && !loan.cliente.is_system ? loan.cliente.telefono : null;

  return (
    <div
      className={cn(
        "rounded-2xl border p-3.5 sm:p-4",
        compacta
          ? "border-border bg-muted/20"
          : dias >= 15
            ? "border-red-200 bg-red-50/40 dark:border-red-900/70 dark:bg-red-950/20"
            : dias >= 7
              ? "border-amber-200 bg-amber-50/40 dark:border-amber-900/70 dark:bg-amber-950/20"
              : "border-border bg-background",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <button type="button" onClick={onAbrir} className="min-w-0 flex-1 cursor-pointer text-left">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">{quienDebe(loan)}</span>
            {sinCliente && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                Sin cliente
              </span>
            )}
            {tel && <MessageCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground tabular-nums">
            {fechaCorta(loan.created_at)} · {edad(dias)}
            {loan.vendedor && ` · ${loan.vendedor}`}
            {loan.sale_items.length > 0 &&
              ` · ${loan.sale_items.map((i) => i.products?.name ?? "Producto").join(", ")}`}
          </span>
        </button>

        <div className="w-44 shrink-0">
          {loan.pagado_cents > 0 ? (
            <>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                Abonó {formatMXN(loan.pagado_cents)} de {formatMXN(loan.total_cents)}
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Sin abonos</p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <p className="text-[11px] text-muted-foreground">Resta</p>
          <p className={cn("text-xl font-bold tabular-nums", dias >= 15 && "text-red-700 dark:text-red-400")}>
            {formatMXN(falta)}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button className="h-10" onClick={onCobrar}>
            Cobrar
          </Button>
          <Button variant="secondary" className="h-10" onClick={onAbrir}>
            Abonar
          </Button>
          <Button
            variant="secondary"
            className="h-10 w-10 px-0"
            aria-label={`Reimprimir ticket de ${quienDebe(loan)}`}
            onClick={() => imprimirTicketNavegador(ticketDeNota(loan, pie))}
          >
            <Printer className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Grupo({
  nombre,
  notas,
  pie,
  onAbrir,
  onCobrar,
}: {
  nombre: string;
  notas: Loan[];
  pie: PieNota;
  onAbrir: (l: Loan) => void;
  onCobrar: (l: Loan) => void;
}) {
  const total = notas.reduce((s, l) => s + restaDe(l), 0);
  const abonado = notas.reduce((s, l) => s + l.pagado_cents, 0);
  const suma = notas.reduce((s, l) => s + l.total_cents, 0);
  const pct = suma > 0 ? Math.min(100, Math.round((abonado / suma) * 100)) : 0;
  const tel = notas[0].cliente?.telefono ?? null;
  const dias = Math.max(...notas.map((l) => diasDe(l.created_at)));

  return (
    <div className="space-y-2.5 rounded-2xl border border-border p-3.5 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">{nombre}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {notas.length} notas
            </span>
            {tel && <MessageCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            La más vieja, {edad(dias)}
            {tel && ` · ${tel}`}
          </p>
        </div>
        <div className="w-44 shrink-0">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            Abonó {formatMXN(abonado)} de {formatMXN(suma)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] text-muted-foreground">Debe en total</p>
          <p className="text-xl font-bold tabular-nums">{formatMXN(total)}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" className="h-10" onClick={() => onAbrir(notas[0])}>
            Estado de cuenta
          </Button>
          {tel && (
            <Button
              variant="secondary"
              className="h-10 w-10 px-0"
              aria-label={`Recordar a ${nombre} por WhatsApp`}
              onClick={() => window.open(waLink(tel, textoRecordatorio(notas[0])), "_blank")}
            >
              <MessageCircle className="h-4 w-4 text-emerald-600" />
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2 sm:pl-4">
        {notas.map((l) => (
          <FilaNota key={l.id} loan={l} pie={pie} compacta onAbrir={() => onAbrir(l)} onCobrar={() => onCobrar(l)} />
        ))}
      </div>
    </div>
  );
}
