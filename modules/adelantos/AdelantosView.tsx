"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  HandCoins,
  Package,
  Plus,
  Search,
  User,
  Check,
  X,
} from "lucide-react";
import { formatMXN } from "@/lib/money";
import type { PaymentMethod, Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import {
  crearAdelanto,
  abonarAdelanto,
  entregarAdelanto,
  cancelarAdelanto,
  type AdelantoTipo,
} from "./actions";

export type AdelantoProducto = Pick<
  Product,
  "id" | "sku" | "name" | "size" | "price_cents" | "quantity"
> & { inventory_name?: string | null };

export type Adelanto = {
  id: string;
  tipo: AdelantoTipo;
  nombre: string;
  sku: string | null;
  qty: number;
  precio_cents: number;
  cliente: string | null;
  created_at: string;
  pagado_cents: number;
};

const METODOS: [PaymentMethod, string][] = [
  ["efectivo", "Efectivo"],
  ["tarjeta", "Tarjeta"],
  ["transferencia", "Transferencia"],
  ["otro", "Otro"],
];

export function AdelantosView({
  adelantos,
  products,
}: {
  adelantos: Adelanto[];
  products: AdelantoProducto[];
}) {
  const [crear, setCrear] = useState(false);
  const porCobrar = adelantos.reduce(
    (s, a) => s + Math.max(0, a.precio_cents - a.pagado_cents),
    0,
  );
  const abonado = adelantos.reduce((s, a) => s + a.pagado_cents, 0);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Adelantos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Apartados y pedidos que el cliente paga por adelantado, en abonos.
          </p>
        </div>
        <Button onClick={() => setCrear(true)}>
          <Plus className="h-4 w-4" />
          Nuevo adelanto
        </Button>
      </div>

      {adelantos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <Card className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Abonado</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums">
              {formatMXN(abonado)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium text-muted-foreground">Por cobrar</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums">
              {formatMXN(porCobrar)}
            </p>
          </Card>
        </div>
      )}

      {adelantos.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title="Sin adelantos activos"
          description="Crea un apartado (con stock) o un pedido especial (sin stock) con su primer abono."
        />
      ) : (
        <div className="space-y-2.5">
          {adelantos.map((a) => (
            <AdelantoRow key={a.id} a={a} />
          ))}
        </div>
      )}

      {crear && (
        <CrearModal products={products} onClose={() => setCrear(false)} />
      )}
    </section>
  );
}

function AdelantoRow({ a }: { a: Adelanto }) {
  const router = useRouter();
  const [abonar, setAbonar] = useState(false);
  const [pending, start] = useTransition();

  const resta = Math.max(0, a.precio_cents - a.pagado_cents);
  const pct = Math.min(100, Math.round((a.pagado_cents / a.precio_cents) * 100));
  const pagado = resta === 0;

  function entregar() {
    if (!confirm("¿Entregar el producto? Debe estar pagado por completo.")) return;
    start(async () => {
      try {
        await entregarAdelanto(a.id);
        toast.success("Entregado");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al entregar");
      }
    });
  }
  function cancelar() {
    if (!confirm("¿Cancelar el adelanto? Se devuelven los abonos y (si aplica) el stock.")) return;
    start(async () => {
      try {
        await cancelarAdelanto(a.id);
        toast.success("Adelanto cancelado");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al cancelar");
      }
    });
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge tone={a.tipo === "apartado" ? "accent" : "warning"}>
              {a.tipo === "apartado" ? "Apartado" : "Pedido"}
            </Badge>
            <p className="truncate font-medium">
              {a.qty > 1 ? `${a.qty}× ` : ""}
              {a.nombre}
            </p>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            {a.cliente || "Sin nombre"}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-semibold tabular-nums">
            {formatMXN(a.precio_cents)}
          </p>
          <p className="text-xs text-muted-foreground">
            Pagado {formatMXN(a.pagado_cents)} · resta{" "}
            <span className="font-medium text-foreground">{formatMXN(resta)}</span>
          </p>
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand to-brand-strong"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        <Button variant="ghost" onClick={cancelar} disabled={pending}>
          <X className="h-4 w-4" />
          Cancelar
        </Button>
        {pagado ? (
          <Button variant="accent" onClick={entregar} loading={pending}>
            <Check className="h-4 w-4" />
            Entregar
          </Button>
        ) : (
          <Button onClick={() => setAbonar(true)} disabled={pending}>
            <HandCoins className="h-4 w-4" />
            Abonar
          </Button>
        )}
      </div>

      {abonar && (
        <AbonarModal a={a} resta={resta} onClose={() => setAbonar(false)} />
      )}
    </Card>
  );
}

function AbonarModal({
  a,
  resta,
  onClose,
}: {
  a: Adelanto;
  resta: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<PaymentMethod>("efectivo");
  const [pending, start] = useTransition();

  function save() {
    const pesos = Number(monto.replace(",", "."));
    if (!Number.isFinite(pesos) || pesos <= 0) return toast.error("Monto inválido");
    if (Math.round(pesos * 100) > resta) return toast.error("El abono excede lo que falta");
    start(async () => {
      try {
        await abonarAdelanto(a.id, pesos, metodo);
        toast.success(`Abono registrado · ${formatMXN(Math.round(pesos * 100))}`);
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al abonar");
      }
    });
  }

  return (
    <Modal open onClose={onClose} title="Registrar abono" className="max-w-sm">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {a.nombre} · falta{" "}
          <span className="font-medium text-foreground">{formatMXN(resta)}</span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Monto (MXN)</span>
            <Input
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Método</span>
            <Select value={metodo} onChange={(e) => setMetodo(e.target.value as PaymentMethod)}>
              {METODOS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <button
          type="button"
          onClick={() => setMonto((resta / 100).toString())}
          className="cursor-pointer text-xs font-medium text-accent hover:underline"
        >
          Abonar el resto ({formatMXN(resta)})
        </button>
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={save} loading={pending}>
            Guardar abono
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CrearModal({
  products,
  onClose,
}: {
  products: AdelantoProducto[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [tipo, setTipo] = useState<AdelantoTipo>("apartado");
  const [prod, setProd] = useState<AdelantoProducto | null>(null);
  const [query, setQuery] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [qty, setQty] = useState("1");
  const [precio, setPrecio] = useState("");
  const [cliente, setCliente] = useState("");
  const [abono, setAbono] = useState("");
  const [metodo, setMetodo] = useState<PaymentMethod>("efectivo");
  const [pending, start] = useTransition();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = products.filter((p) =>
      tipo === "apartado" ? p.quantity > 0 : true,
    );
    const list = q
      ? base.filter(
          (p) =>
            p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
        )
      : base;
    return list.slice(0, 8);
  }, [query, products, tipo]);

  function pick(p: AdelantoProducto) {
    setProd(p);
    setQuery("");
    const n = Math.max(1, Math.round(Number(qty) || 1));
    if (p.price_cents > 0) setPrecio(((p.price_cents * n) / 100).toString());
  }

  const precioNum = Number(precio.replace(",", "."));
  const abonoNum = Number(abono.replace(",", ".")) || 0;
  const valido =
    precioNum > 0 &&
    (prod ? true : tipo === "pedido" && descripcion.trim().length > 0) &&
    (tipo !== "apartado" || !!prod) &&
    abonoNum * 100 <= Math.round(precioNum * 100);

  function save() {
    if (!valido) return toast.error("Revisa producto, precio y abono");
    start(async () => {
      try {
        await crearAdelanto({
          tipo,
          productId: prod?.id ?? null,
          descripcion: prod ? null : descripcion,
          qty: Math.max(1, Math.round(Number(qty) || 1)),
          precio: precioNum,
          cliente,
          abono: abonoNum,
          abonoMetodo: metodo,
        });
        toast.success("Adelanto creado");
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al crear");
      }
    });
  }

  return (
    <Modal open onClose={onClose} title="Nuevo adelanto" className="max-w-lg">
      <div className="space-y-4">
        <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs">
          {(
            [
              ["apartado", "Apartado (con stock)"],
              ["pedido", "Pedido (sin stock)"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              onClick={() => {
                setTipo(v);
                setProd(null);
              }}
              className={cn(
                "cursor-pointer rounded-md px-3 py-1 font-medium transition-colors",
                tipo === v
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {l}
            </button>
          ))}
        </div>

        {/* Product picker / description */}
        {prod ? (
          <div className="flex items-center gap-3 rounded-xl border border-border p-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Package className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{prod.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{prod.sku}</span> · {prod.quantity} disp.
                {prod.inventory_name ? ` · ${prod.inventory_name}` : ""}
              </p>
            </div>
            <button
              onClick={() => setProd(null)}
              className="cursor-pointer rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Quitar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  tipo === "apartado"
                    ? "Buscar producto con stock…"
                    : "Buscar producto (o déjalo y escribe abajo)…"
                }
                className="h-10 pl-9"
              />
            </div>
            {query.trim() && (
              <div className="mt-2 max-h-48 space-y-1 overflow-auto">
                {results.length === 0 ? (
                  <p className="px-1 py-3 text-center text-xs text-muted-foreground">
                    Sin resultados.
                  </p>
                ) : (
                  results.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => pick(p)}
                      className="flex w-full items-center gap-2 rounded-lg border border-border p-2 text-left text-sm transition-colors hover:bg-muted/40"
                    >
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {p.quantity} disp.
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
            {tipo === "pedido" && (
              <Input
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="…o describe el producto (ej: Pantalla Xiaomi Mi 11 OLED)"
                className="mt-2"
              />
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Cantidad</span>
            <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" />
          </label>
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Precio total (MXN)</span>
            <Input
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Cliente</span>
          <Input
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            placeholder="Nombre o referencia"
          />
        </label>

        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-medium">Primer abono (opcional)</p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={abono}
              onChange={(e) => setAbono(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
            <Select value={metodo} onChange={(e) => setMetodo(e.target.value as PaymentMethod)}>
              {METODOS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={save} loading={pending} disabled={!valido}>
            Crear adelanto
          </Button>
        </div>
      </div>
    </Modal>
  );
}
