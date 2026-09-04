"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CreditCard,
  ArrowLeftRight,
  Wallet,
  Delete,
  Check,
  Split as SplitIcon,
  PiggyBank,
} from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PaymentMethodVenta } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdjuntarImagen } from "@/components/ui/adjuntar-imagen";
import { CuentaPicker, useCuentas, SinCuentasAviso } from "@/components/ui/cuenta";

const METODOS: {
  value: PaymentMethodVenta;
  label: string;
  icon: typeof Banknote;
}[] = [
  { value: "efectivo", label: "Efectivo", icon: Banknote },
  { value: "tarjeta", label: "Tarjeta", icon: CreditCard },
  { value: "transferencia", label: "Transfer.", icon: ArrowLeftRight },
  { value: "otro", label: "Otro", icon: Wallet },
  { value: "saldo", label: "Saldo", icon: PiggyBank },
];

const ceilTo = (cents: number, step: number) => Math.ceil(cents / step) * step;

export function PaymentSheet({
  open,
  onClose,
  total,
  saldoDisponible,
  pending,
  comprobanteObligatorio = false,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  total: number; // cents
  /** This customer's store credit, in cents. 0 hides the method entirely. */
  saldoDisponible: number;
  pending: boolean;
  /** Shop rule: a transfer without its proof is not a payment. */
  comprobanteObligatorio?: boolean;
  onConfirm: (
    metodo: PaymentMethodVenta,
    pagos?: { metodo: PaymentMethodVenta; monto_cents: number }[],
    comprobante?: { referencia: string | null; foto: File | null; cuentaId: string | null },
  ) => void;
}) {
  // Modal is the drawer on phones now — no local switch needed.
  return (
    <Modal open={open} onClose={onClose} title="Cobrar" className="max-w-md">
      <PaymentContent
        total={total}
        saldoDisponible={saldoDisponible}
        pending={pending}
        comprobanteObligatorio={comprobanteObligatorio}
        onCancel={onClose}
        onConfirm={onConfirm}
      />
    </Modal>
  );
}

function PaymentContent({
  total,
  saldoDisponible,
  pending,
  comprobanteObligatorio = false,
  onCancel,
  onConfirm,
}: {
  total: number;
  saldoDisponible: number;
  pending: boolean;
  comprobanteObligatorio?: boolean;
  onCancel: () => void;
  onConfirm: (
    metodo: PaymentMethodVenta,
    pagos?: { metodo: PaymentMethodVenta; monto_cents: number }[],
    comprobante?: { referencia: string | null; foto: File | null; cuentaId: string | null },
  ) => void;
}) {
  const [metodo, setMetodo] = useState<PaymentMethodVenta>("efectivo");
  // Transfer proof: the reference and/or screenshot the customer shows. It
  // attaches AFTER the sale registers — a failed photo never loses the sale.
  const [referencia, setReferencia] = useState("");
  const [foto, setFoto] = useState<File | null>(null);
  const [cuentaId, setCuentaId] = useState<string | null>(null);
  const cuentas = useCuentas();
  const listaCuentas = cuentas ?? [];
  const sinCuentas = cuentas !== null && cuentas.length === 0;
  const [recibido, setRecibido] = useState(""); // pesos, as typed
  // Split payment: an amount per method, as typed. Off by default — the common
  // sale is one method and shouldn't pay for this.
  const [dividir, setDividir] = useState(false);
  const [montos, setMontos] = useState<Record<string, string>>({});

  const pagos = METODOS.map((m) => ({
    metodo: m.value,
    monto_cents: Math.round((Number((montos[m.value] ?? "").replace(",", ".")) || 0) * 100),
  })).filter((p) => p.monto_cents > 0);
  const asignado = pagos.reduce((s, p) => s + p.monto_cents, 0);
  const restante = total - asignado;

  // Store credit is the one method with a ceiling. Blocked rather than clamped:
  // silently lowering it would charge the customer a different split than the
  // one on screen.
  const saldoAsignado = pagos.find((p) => p.metodo === "saldo")?.monto_cents ?? 0;
  const saldoExcedido = saldoAsignado > saldoDisponible;

  const splitCuadra = dividir && restante === 0 && pagos.length > 0 && !saldoExcedido;

  // Reset the typed amount when switching away from cash.
  useEffect(() => {
    if (metodo !== "efectivo") setRecibido("");
  }, [metodo]);

  const esEfectivo = metodo === "efectivo";
  const recibidoCents = Math.round((Number(recibido.replace(",", ".")) || 0) * 100);
  const hayRecibido = esEfectivo && recibido.trim() !== "";
  const cambio = hayRecibido ? recibidoCents - total : 0;
  const insuficiente = hayRecibido && recibidoCents < total;
  // Cash: allow "exact" (empty) or received ≥ total. Non-cash: always ok.
  const alcanzaSaldo = metodo !== "saldo" || saldoDisponible >= total;
  const puedeCobrarSimple =
    (!esEfectivo || !hayRecibido || recibidoCents >= total) && alcanzaSaldo;
  const hayTransferencia = dividir
    ? pagos.some((p) => p.metodo === "transferencia")
    : metodo === "transferencia";
  const faltaComprobante =
    comprobanteObligatorio && hayTransferencia && !referencia.trim() && !foto;
  // A transfer MUST say where it landed — and with no accounts registered at
  // all there is nowhere for it to land, so the method is blocked outright.
  const faltaCuenta = hayTransferencia && (listaCuentas.length > 0 ? !cuentaId : sinCuentas);
  const puedeCobrar =
    (dividir ? splitCuadra : puedeCobrarSimple) && !faltaComprobante && !faltaCuenta;

  const sugerencias = useMemo(() => {
    const opts = new Set<number>([
      total,
      ceilTo(total, 5000),
      ceilTo(total, 10000),
      ceilTo(total, 20000),
      ceilTo(total, 50000),
    ]);
    return [...opts].filter((c) => c >= total).slice(0, 4);
  }, [total]);

  function press(k: string) {
    setRecibido((r) => {
      if (k === "del") return r.slice(0, -1);
      if (k === ".") return r.includes(".") ? r : r === "" ? "0." : r + ".";
      const next = (r + k).replace(/^0+(?=\d)/, "");
      // cap 2 decimals
      if (next.includes(".") && next.split(".")[1].length > 2) return r;
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Total */}
      <div className="flex items-center justify-between rounded-xl bg-muted/50 px-4 py-3">
        <span className="text-sm text-muted-foreground">Total a cobrar</span>
        <span className="font-mono text-2xl font-semibold tabular-nums">
          {formatMXN(total)}
        </span>
      </div>

      {/* Split toggle — a mixed payment is the exception, so it stays out of
          the way until asked for. */}
      <button
        onClick={() => setDividir((d) => !d)}
        className={cn(
          "flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border py-2 text-sm font-medium transition-colors",
          dividir
            ? "border-accent bg-accent-soft text-accent"
            : "border-dashed border-border text-muted-foreground hover:border-ring/40 hover:text-foreground",
        )}
      >
        <SplitIcon className="h-4 w-4" />
        {dividir ? "Cobrar con un solo método" : "Dividir el pago"}
      </button>

      {dividir ? (
        <div className="space-y-3">
          <div className="space-y-2">
            {METODOS.filter((m) => m.value !== "saldo" || saldoDisponible > 0).map((m) => (
              <label key={m.value} className="flex items-center gap-3">
                <span className="flex w-32 shrink-0 items-center gap-2 text-sm">
                  <m.icon className="h-4 w-4 text-muted-foreground" />
                  {m.label}
                </span>
                <input
                  value={montos[m.value] ?? ""}
                  onChange={(e) =>
                    setMontos((cur) => ({ ...cur, [m.value]: e.target.value }))
                  }
                  inputMode="decimal"
                  placeholder="0.00"
                  className={cn(
                    "h-10 w-full rounded-lg border bg-background px-3 text-right font-mono tabular-nums outline-none focus:border-ring/40",
                    m.value === "saldo" && saldoExcedido
                      ? "border-red-500"
                      : "border-border",
                  )}
                />
                {/* Credit is the one row with a ceiling, so it says what the
                    ceiling is and fills itself — the common case is "use all
                    of it and charge me the difference". */}
                {m.value === "saldo" && (
                  <button
                    type="button"
                    onClick={() =>
                      setMontos((cur) => ({
                        ...cur,
                        saldo: (Math.min(saldoDisponible, total) / 100).toFixed(2),
                      }))
                    }
                    className="shrink-0 cursor-pointer whitespace-nowrap text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    de {formatMXN(saldoDisponible)}
                  </button>
                )}
              </label>
            ))}
          </div>

          <div className="space-y-1 text-sm">
            <Row label="Asignado" value={formatMXN(asignado)} />
            <Row
              label={restante > 0 ? "Falta" : restante < 0 ? "Sobra" : "Cuadra"}
              value={restante === 0 ? formatMXN(total) : formatMXN(Math.abs(restante))}
              strong
              tone={restante === 0 ? "accent" : "danger"}
            />
          </div>

          {saldoExcedido && (
            <p className="text-xs text-red-600 dark:text-red-400">
              El saldo del cliente es {formatMXN(saldoDisponible)}. No se puede
              asignar más de eso.
            </p>
          )}
          {restante !== 0 && (
            <p className="text-xs text-muted-foreground">
              Los montos deben sumar exactamente el total para poder cobrar.
            </p>
          )}
        </div>
      ) : (
      <>
      {/* Method tiles */}
      <div className="grid grid-cols-4 gap-2">
        {METODOS.map((m) => {
          const active = metodo === m.value;
          return (
            <button
              key={m.value}
              onClick={() => setMetodo(m.value)}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border p-2.5 text-xs font-medium transition-colors",
                active
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-muted-foreground hover:border-ring/40 hover:text-foreground",
              )}
            >
              <m.icon className="h-5 w-5" />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Credit chosen on its own but short. The Cobrar button greys out either
          way; without this it greys out for no visible reason, and the seller
          is one tap from the answer without knowing the tap exists. */}
      {metodo === "saldo" && !alcanzaSaldo && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            El saldo no alcanza
          </p>
          <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
            Tiene {formatMXN(saldoDisponible)} y la venta es {formatMXN(total)}.
            Faltan {formatMXN(total - saldoDisponible)}.
          </p>
          <button
            type="button"
            onClick={() => {
              setDividir(true);
              setMontos((cur) => ({
                ...cur,
                saldo: (saldoDisponible / 100).toFixed(2),
              }));
            }}
            className="mt-2 cursor-pointer text-xs font-medium text-amber-900 underline underline-offset-2 dark:text-amber-200"
          >
            Usar su saldo y cobrar la diferencia
          </button>
        </div>
      )}

      {/* Credit chosen and enough: say what is left, because the whole reason
          for a partial spend is that the rest stays with them. */}
      {metodo === "saldo" && alcanzaSaldo && saldoDisponible > total && (
        <p className="text-xs text-muted-foreground">
          Le quedarán {formatMXN(saldoDisponible - total)} a favor.
        </p>
      )}

      {esEfectivo && (
        <>
          {/* Received amount */}
          <div
            className={cn(
              "flex h-14 items-center justify-end rounded-xl border px-4 font-mono text-2xl font-semibold tabular-nums",
              insuficiente ? "border-red-300 dark:border-red-800 text-red-600 dark:text-red-400" : "border-border",
            )}
          >
            {recibido === "" ? (
              <span className="text-muted-foreground">Recibido…</span>
            ) : (
              `$${recibido}`
            )}
          </div>

          {/* Change / due */}
          <div className="space-y-1 text-sm">
            <Row label="Recibido" value={hayRecibido ? formatMXN(recibidoCents) : "—"} />
            <Row
              label={cambio >= 0 ? "Cambio" : "Falta"}
              value={hayRecibido ? formatMXN(Math.abs(cambio)) : "—"}
              strong
              tone={insuficiente ? "danger" : cambio > 0 ? "accent" : "default"}
            />
          </div>

          {/* Quick amounts */}
          <div className="grid grid-cols-4 gap-2">
            {sugerencias.map((c, i) => (
              <button
                key={c}
                onClick={() => setRecibido(String(c / 100))}
                className="cursor-pointer rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-ring/40 hover:text-foreground"
              >
                {i === 0 ? "Exacto" : formatMXN(c)}
              </button>
            ))}
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"].map((k) => (
              <button
                key={k}
                onClick={() => press(k)}
                aria-label={k === "del" ? "Borrar" : k}
                className="flex h-11 cursor-pointer items-center justify-center rounded-lg border border-border text-lg font-medium tabular-nums transition-colors hover:bg-muted active:bg-muted/70"
              >
                {k === "del" ? <Delete className="h-5 w-5" /> : k}
              </button>
            ))}
          </div>
        </>
      )}

      </>
      )}

      {/* Actions */}
      {hayTransferencia && (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Comprobante de la transferencia {comprobanteObligatorio ? "(obligatorio)" : "(opcional)"}
          </p>
          <Input
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            placeholder="Referencia / clave de rastreo"
          />
          <AdjuntarImagen value={foto} onChange={setFoto} />
          <CuentaPicker
            cuentas={listaCuentas}
            value={cuentaId}
            onChange={setCuentaId}
            label="¿A cuál cuenta llegó? (obligatorio)"
          />
          {hayTransferencia && sinCuentas && <SinCuentasAviso />}
        </div>
      )}

      <div className="flex gap-2 border-t border-border pt-4">
        <Button variant="ghost" className="flex-1" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button
          variant="accent"
          className="flex-1"
          onClick={() => {
            const comp =
              referencia.trim() || foto || cuentaId
                ? { referencia: referencia.trim() || null, foto, cuentaId }
                : undefined;
            if (dividir) onConfirm("mixto" as PaymentMethodVenta, pagos, comp);
            else onConfirm(metodo, metodo === "saldo" ? [{ metodo, monto_cents: total }] : undefined, comp);
          }}
          loading={pending}
          disabled={!puedeCobrar}
        >
          <Check className="h-4 w-4" />
          Completar cobro
        </Button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  tone = "default",
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "default" | "accent" | "danger";
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-muted-foreground", strong && "font-medium text-foreground")}>
        {label}
      </span>
      <span
        className={cn(
          "font-mono tabular-nums",
          strong && "text-base font-semibold",
          tone === "accent" && "text-accent",
          tone === "danger" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </span>
    </div>
  );
}
