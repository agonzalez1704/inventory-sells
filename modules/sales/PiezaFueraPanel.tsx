"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Plus, Store, X } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/components/use-is-mobile";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { CustomerPicker, type PickerCustomer } from "@/modules/customers/CustomerPicker";
import {
  crearVecino,
  listarVecinos,
  referenciaCatalogo,
  registrarPiezaDeFuera,
  type PiezaFueraResult,
  type Referencia,
  type Vecino,
} from "./pieza-fuera";

const aCentavos = (s: string) => Math.round((Number(s.replace(",", ".")) || 0) * 100);
const aPesos = (c: number) => (c / 100).toFixed(2);

/**
 * "Pieza de fuera": bought next door with cash from the drawer, handed to a
 * customer on credit (or charged now). The price starts at cost for the
 * shop's own customer and at our list price for anyone else; whatever the
 * seller picks, the panel says what leaves the drawer and what is earned.
 */
export function PiezaFueraPanel({
  open,
  customers,
  clienteInicial,
  onClose,
  onNota,
  onPagar,
}: {
  open: boolean;
  customers: PickerCustomer[];
  clienteInicial: PickerCustomer | null;
  onClose: () => void;
  /** A credit note was made; the register refreshes. */
  onNota: (r: PiezaFueraResult) => void;
  /** The part is bought and in stock; the register puts it in the cart and charges. */
  onPagar: (r: PiezaFueraResult) => void;
}) {
  const isMobile = useIsMobile();
  const [pending, start] = useTransition();
  const [cliente, setCliente] = useState<PickerCustomer | null>(null);
  const [nombre, setNombre] = useState("");
  const [qty, setQty] = useState("1");
  const [vecinos, setVecinos] = useState<Vecino[]>([]);
  const [vecino, setVecino] = useState<Vecino | null>(null);
  const [vecinoQ, setVecinoQ] = useState("");
  const [costo, setCosto] = useState("");
  const [precio, setPrecio] = useState("");
  const [precioTocado, setPrecioTocado] = useState(false);
  const [entrega, setEntrega] = useState<"nota" | "pagar">("nota");
  const [ref, setRef] = useState<Referencia | null>(null);

  useEffect(() => {
    if (!open) return;
    setCliente(clienteInicial && !clienteInicial.is_system ? clienteInicial : null);
    setNombre("");
    setQty("1");
    setVecino(null);
    setVecinoQ("");
    setCosto("");
    setPrecio("");
    setPrecioTocado(false);
    setEntrega("nota");
    setRef(null);
    listarVecinos().then(setVecinos).catch(() => setVecinos([]));
  }, [open, clienteInicial]);

  // Our own catalog, as the name is typed: the price not to undercharge.
  useEffect(() => {
    if (!open) return;
    let vivo = true;
    const t = setTimeout(() => {
      referenciaCatalogo(nombre)
        .then((r) => vivo && setRef(r))
        .catch(() => vivo && setRef(null));
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [nombre, open]);

  const costoC = aCentavos(costo);
  const precioC = aCentavos(precio);
  const n = Math.max(1, Math.round(Number(qty) || 1));
  const propio = /ifound/i.test(cliente?.nombre ?? "");

  // Default price: cost for our own company, our list price (else +20%) for
  // anyone else. Only until the seller types a price of their own.
  useEffect(() => {
    if (precioTocado || !costoC) return;
    const sugerido = propio ? costoC : ref?.precio_cents && ref.precio_cents > costoC ? ref.precio_cents : Math.round(costoC * 1.2);
    setPrecio(aPesos(sugerido));
  }, [costoC, propio, ref, precioTocado]);

  const ganancia = (precioC - costoC) * n;
  const chips: { label: string; cents: number }[] = costoC
    ? [
        { label: "Al costo", cents: costoC },
        { label: `+10 % · ${formatMXN(Math.round(costoC * 1.1))}`, cents: Math.round(costoC * 1.1) },
        { label: `+20 % · ${formatMXN(Math.round(costoC * 1.2))}`, cents: Math.round(costoC * 1.2) },
        ...(ref ? [{ label: `Lista · ${formatMXN(ref.precio_cents)}`, cents: ref.precio_cents }] : []),
      ]
    : [];

  const listo =
    nombre.trim().length >= 3 && !!vecino && costoC > 0 && precioC > 0 && (entrega === "pagar" || !!cliente) && !pending;

  function nuevoVecino() {
    const nom = vecinoQ.trim();
    if (nom.length < 2) return;
    start(async () => {
      const r = await crearVecino(nom);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setVecinos((v) => [...v, r.data].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
      setVecino(r.data);
      toast.success(`${r.data.nombre} agregado a proveedores`);
    });
  }

  function registrar() {
    if (!listo || !vecino) return;
    start(async () => {
      const r = await registrarPiezaDeFuera({
        nombre,
        qty: n,
        vecinoId: vecino.id,
        costoCents: costoC,
        precioCents: precioC,
        customerId: cliente?.id ?? null,
        entrega,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.data.gastoFallo) toast.error(`Pieza registrada, pero el retiro de caja no se guardó: ${r.data.gastoFallo}. Captúralo en Caja.`);
      if (entrega === "nota") {
        toast.success(`Nota a ${cliente?.nombre} · salieron ${formatMXN(costoC * n)} del cajón`);
        onNota(r.data);
      } else {
        toast.success(`Salieron ${formatMXN(costoC * n)} del cajón · ahora cobra la pieza`);
        onPagar(r.data);
      }
    });
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} swipeDirection={isMobile ? "down" : "right"} showSwipeHandle={isMobile}>
      <DrawerContent className="data-[swipe-direction=down]:top-16 data-[swipe-direction=down]:max-h-none data-[swipe-direction=right]:w-[min(480px,100vw)]">
        <div className="flex items-start justify-between gap-3 px-4 pt-1 pb-3 sm:px-6 sm:pt-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-foreground">
              <Store className="h-5 w-5" />
            </span>
            <div>
              <DrawerTitle className="text-lg font-semibold sm:text-xl">Pieza de fuera</DrawerTitle>
              <p className="text-sm text-muted-foreground">Se compra al vecino con efectivo del cajón y se entrega al cliente.</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div data-base-ui-swipe-ignore className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Cliente{entrega === "pagar" ? " · opcional" : ""}</span>
            <CustomerPicker customers={customers} value={cliente} onChange={setCliente} excludeSystem openUp={false} />
            {propio && <p className="text-xs text-muted-foreground">Es nuestro: el precio arranca al costo, sin ganancia.</p>}
          </div>

          <div className="grid grid-cols-[1fr_88px] gap-2.5">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Pieza</span>
              <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Pantalla OLED iPhone 13" className="h-11 text-base sm:text-sm" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Cantidad</span>
              <Input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className="h-11 text-center font-mono text-base sm:text-sm" />
            </label>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">¿A quién se le compró?</span>
            <Combobox
              items={vecinos}
              value={vecino}
              onValueChange={(v) => setVecino((v as Vecino | null) ?? null)}
              inputValue={vecinoQ}
              onInputValueChange={setVecinoQ}
              itemToStringLabel={(v: Vecino) => v.nombre}
              isItemEqualToValue={(a: Vecino, b: Vecino) => a.id === b.id}
              filter={(item: Vecino, q: string) => item.nombre.toLowerCase().includes(q.trim().toLowerCase())}
              autoHighlight
              openOnInputClick
            >
              <ComboboxInput placeholder="Movil House, Moca…" aria-label="Proveedor" showClear={!!vecino} />
              <ComboboxContent>
                <ComboboxEmpty>
                  <button type="button" onClick={nuevoVecino} className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-foreground hover:underline">
                    <Plus className="h-4 w-4" /> Agregar «{vecinoQ.trim()}» como proveedor
                  </button>
                </ComboboxEmpty>
                <ComboboxList>{(v: Vecino) => <ComboboxItem key={v.id} value={v}>{v.nombre}</ComboboxItem>}</ComboboxList>
              </ComboboxContent>
            </Combobox>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Costo pagado</span>
              <span className="flex h-11 items-center gap-1.5 rounded-lg border border-border bg-background px-3 focus-within:border-ring">
                <span className="text-muted-foreground">$</span>
                <input inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="0.00" className="w-full min-w-0 bg-transparent font-mono text-lg outline-hidden" />
              </span>
              <span className="block text-xs text-muted-foreground">Sale del cajón ahora</span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Precio al cliente</span>
              <span className="flex h-11 items-center gap-1.5 rounded-lg border-2 border-primary bg-background px-3">
                <span className="text-muted-foreground">$</span>
                <input inputMode="decimal" value={precio} onChange={(e) => { setPrecio(e.target.value); setPrecioTocado(true); }} placeholder="0.00" className="w-full min-w-0 bg-transparent font-mono text-lg outline-hidden" />
              </span>
              <span className={cn("block text-xs", ganancia > 0 ? "text-emerald-700 dark:text-emerald-400" : ganancia < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                {!costoC || !precioC ? " " : ganancia === 0 ? "Igual al costo: sin ganancia" : ganancia > 0 ? `Ganas ${formatMXN(ganancia)} (${(((precioC - costoC) / costoC) * 100).toFixed(1)} %)` : `Pierdes ${formatMXN(-ganancia)}`}
              </span>
            </label>
          </div>

          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  aria-pressed={precioC === c.cents}
                  onClick={() => { setPrecio(aPesos(c.cents)); setPrecioTocado(true); }}
                  className={cn(
                    "h-8 cursor-pointer rounded-full border px-3 text-xs font-medium",
                    precioC === c.cents ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {ref && (
            <p className="-mt-2 text-xs text-muted-foreground">
              En tu catálogo: <b className="text-foreground">{ref.nombre}</b> a {formatMXN(ref.precio_cents)}
              {ref.inventario ? ` (${ref.inventario}, ${ref.quantity} en piso)` : ""}.
            </p>
          )}

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Entrega</span>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ["nota", "A crédito (nota)"],
                  ["pagar", "Pagada ahora"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={entrega === k}
                  onClick={() => setEntrega(k)}
                  className={cn(
                    "h-11 cursor-pointer rounded-lg border text-sm font-medium",
                    entrega === k ? "border-2 border-primary font-semibold" : "border-border hover:bg-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {entrega === "pagar" && <p className="text-xs text-muted-foreground">La pieza pasa al carrito y se cobra como siempre: efectivo, tarjeta, transferencia o dividir.</p>}
          </div>

          <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/30 px-3.5 py-3 text-sm">
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Al confirmar</p>
            <div className="flex justify-between">
              <span>Sale del cajón{vecino ? ` (gasto a ${vecino.nombre})` : ""}</span>
              <span className="font-mono tabular-nums text-red-600 dark:text-red-400">−{formatMXN(costoC * n)}</span>
            </div>
            <div className="flex justify-between">
              <span>{entrega === "nota" ? `Nota de crédito a ${cliente?.nombre ?? "…"}` : "Venta al cobrar"}</span>
              <span className="font-mono tabular-nums">{formatMXN(precioC * n)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
              <span>Ganancia</span>
              <span className={cn("font-mono tabular-nums", ganancia > 0 && "text-emerald-700 dark:text-emerald-400")}>{ganancia > 0 ? "+" : ""}{formatMXN(ganancia)}</span>
            </div>
            {entrega === "nota" && <p className="text-xs text-muted-foreground">El efectivo regresa al cajón cuando se cobre la nota.</p>}
          </div>
        </div>

        <div className="border-t border-border px-4 py-3 sm:px-6">
          <Button className="h-12 w-full text-base" disabled={!listo} onClick={registrar}>
            {pending ? "Registrando…" : entrega === "nota" ? `Registrar · sale ${formatMXN(costoC * n)} del cajón` : `Continuar al cobro · ${formatMXN(precioC * n)}`}
            {!pending && <Check className="h-4 w-4" />}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
