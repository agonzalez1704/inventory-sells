"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Search, Trash2, ChevronRight, ArrowLeftRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { unwrap } from "@/lib/errors";
import { buscarProductos, type ProductoBuscado } from "@/modules/inventory/buscar";
import { ejecutarTraspaso, type Traspaso } from "./actions";

type Linea = { product_id: string; sku: string; nombre: string; disponible: number; qty: number };

export function TraspasosView({
  inventarios,
  traspasos,
}: {
  inventarios: { id: string; name: string }[];
  traspasos: Traspaso[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [origen, setOrigen] = useState(inventarios[0]?.id ?? "");
  const [destino, setDestino] = useState(inventarios[1]?.id ?? "");
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [notas, setNotas] = useState("");

  // Search WITHIN the origin inventory only — you can't take what isn't there.
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ProductoBuscado[]>([]);
  useEffect(() => {
    if (!q.trim() || !origen) {
      setResultados([]);
      return;
    }
    let off = false;
    const t = setTimeout(async () => {
      try {
        const rows = await buscarProductos({ query: q, inventoryId: origen, limit: 8 });
        if (!off) setResultados(rows.filter((r) => r.quantity > 0));
      } catch {
        if (!off) setResultados([]);
      }
    }, 180);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [q, origen]);

  // Changing the origin invalidates what was picked from it.
  useEffect(() => setLineas([]), [origen]);

  function agregar(p: ProductoBuscado) {
    setLineas((prev) =>
      prev.some((l) => l.product_id === p.id)
        ? prev
        : [...prev, { product_id: p.id, sku: p.sku, nombre: p.name, disponible: p.quantity, qty: 1 }],
    );
    setQ("");
    setResultados([]);
  }

  function ejecutar() {
    if (origen === destino) return toast.error("Elige inventarios distintos");
    if (lineas.length === 0) return toast.error("Agrega al menos un producto");
    if (lineas.some((l) => l.qty <= 0 || l.qty > l.disponible))
      return toast.error("Revisa las cantidades: no puedes llevarte más de lo que hay");
    start(async () => {
      try {
        unwrap(
          await ejecutarTraspaso(
            origen,
            destino,
            lineas.map((l) => ({ product_id: l.product_id, qty: l.qty })),
            notas || null,
          ),
        );
        const piezas = lineas.reduce((s, l) => s + l.qty, 0);
        toast.success(`Traspaso registrado · ${piezas} pza${piezas > 1 ? "s" : ""} movida${piezas > 1 ? "s" : ""}`);
        setLineas([]);
        setNotas("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo traspasar");
      }
    });
  }

  const nombreInv = (id: string) => inventarios.find((i) => i.id === id)?.name ?? "";

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Traspasos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Mueve mercancía entre inventarios. Queda registrado qué se movió,
          cuánto, quién y cuándo — y desde ese momento se vende en el destino.
        </p>
      </div>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block min-w-44 flex-1">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">De</span>
            <Select value={origen} onChange={(e) => setOrigen(e.target.value)}>
              {inventarios.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </Select>
          </label>
          <ArrowRight className="mb-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <label className="block min-w-44 flex-1">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">A</span>
            <Select value={destino} onChange={(e) => setDestino(e.target.value)}>
              {inventarios.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </Select>
          </label>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Buscar en ${nombreInv(origen)}…`}
            className="pl-9"
          />
          {resultados.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-border bg-background shadow-md">
              {resultados.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => agregar(p)}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {p.name}
                      <span className="ml-2 font-mono text-xs uppercase text-muted-foreground">{p.sku}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{p.quantity} disp.</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lineas.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {lineas.map((l) => (
              <li key={l.product_id} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{l.nombre}</span>
                  <span className="block font-mono text-[11px] uppercase text-muted-foreground">
                    {l.sku} · {l.disponible} disp.
                  </span>
                </span>
                <Input
                  value={String(l.qty)}
                  onChange={(e) => {
                    const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                    setLineas((prev) =>
                      prev.map((x) => (x.product_id === l.product_id ? { ...x, qty: v } : x)),
                    );
                  }}
                  inputMode="numeric"
                  className={cn("w-20 text-right", l.qty > l.disponible && "border-red-400")}
                />
                <button
                  type="button"
                  aria-label={`Quitar ${l.sku}`}
                  onClick={() => setLineas((prev) => prev.filter((x) => x.product_id !== l.product_id))}
                  className="cursor-pointer rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <label className="block flex-1">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Notas (opcional)
            </span>
            <Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Surtido inicial de la sucursal…" />
          </label>
          <Button onClick={ejecutar} loading={pending} disabled={lineas.length === 0 || origen === destino}>
            <ArrowLeftRight className="h-4 w-4" />
            Traspasar {lineas.reduce((s, l) => s + l.qty, 0) || ""} pzas
          </Button>
        </div>
      </Card>

      <div>
        <h2 className="text-sm font-semibold">Historial</h2>
        {traspasos.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title="Sin traspasos todavía"
            description="Cada movimiento de mercancía entre inventarios queda registrado aquí."
          />
        ) : (
          <ul className="mt-2 space-y-2">
            {traspasos.map((t) => (
              <TraspasoRow key={t.id} t={t} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function TraspasoRow({ t }: { t: Traspaso }) {
  const [abierto, setAbierto] = useState(false);
  const piezas = t.traspaso_items.reduce((s, i) => s + i.qty, 0);
  const fecha = new Date(t.created_at).toLocaleDateString("es-MX", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  return (
    <li className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full cursor-pointer flex-wrap items-center gap-2 p-4 text-left"
      >
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-90")} />
        <span className="font-mono text-sm font-semibold">{t.folio}</span>
        <span className="text-sm">
          {t.origen?.name} <ArrowRight className="inline h-3.5 w-3.5 text-muted-foreground" /> {t.destino?.name}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {piezas} pza{piezas !== 1 ? "s" : ""} · {t.vendedor ?? "—"} · {fecha}
        </span>
      </button>
      {abierto && (
        <div className="border-t border-border px-4 py-3">
          {t.notas && <p className="mb-2 text-xs text-muted-foreground">Nota: {t.notas}</p>}
          <ul className="space-y-1">
            {t.traspaso_items.map((i, idx) => (
              <li key={idx} className="text-sm">
                {i.qty}× {i.producto?.name}
                <span className="ml-2 font-mono text-xs uppercase text-muted-foreground">
                  {i.producto?.sku}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
