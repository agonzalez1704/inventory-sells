"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CreditCard,
  ArrowLeftRight,
  Wallet,
  Delete,
  Check,
} from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/components/use-is-mobile";

const METODOS: {
  value: PaymentMethod;
  label: string;
  icon: typeof Banknote;
}[] = [
  { value: "efectivo", label: "Efectivo", icon: Banknote },
  { value: "tarjeta", label: "Tarjeta", icon: CreditCard },
  { value: "transferencia", label: "Transfer.", icon: ArrowLeftRight },
  { value: "otro", label: "Otro", icon: Wallet },
];

const ceilTo = (cents: number, step: number) => Math.ceil(cents / step) * step;

export function PaymentSheet({
  open,
  onClose,
  total,
  pending,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  total: number; // cents
  pending: boolean;
  onConfirm: (metodo: PaymentMethod) => void;
}) {
  const isMobile = useIsMobile();
  const Container = isMobile ? Drawer : Modal;

  return (
    <Container open={open} onClose={onClose} title="Cobrar" className={isMobile ? "" : "max-w-md"}>
      <PaymentContent total={total} pending={pending} onCancel={onClose} onConfirm={onConfirm} />
    </Container>
  );
}

function PaymentContent({
  total,
  pending,
  onCancel,
  onConfirm,
}: {
  total: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (metodo: PaymentMethod) => void;
}) {
  const [metodo, setMetodo] = useState<PaymentMethod>("efectivo");
  const [recibido, setRecibido] = useState(""); // pesos, as typed

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
  const puedeCobrar = !esEfectivo || !hayRecibido || recibidoCents >= total;

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

      {esEfectivo && (
        <>
          {/* Received amount */}
          <div
            className={cn(
              "flex h-14 items-center justify-end rounded-xl border px-4 font-mono text-2xl font-semibold tabular-nums",
              insuficiente ? "border-red-300 text-red-600" : "border-border",
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

      {/* Actions */}
      <div className="flex gap-2 border-t border-border pt-4">
        <Button variant="ghost" className="flex-1" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button
          variant="accent"
          className="flex-1"
          onClick={() => onConfirm(metodo)}
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
          tone === "danger" && "text-red-600",
        )}
      >
        {value}
      </span>
    </div>
  );
}
