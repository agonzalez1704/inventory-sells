"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { fromCents } from "@/lib/money";
import { Modal } from "@/components/ui/modal";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  getProductForEdit,
  updateProduct,
  adjustStock,
  type EditableProduct,
} from "./actions";

type Form = {
  name: string;
  category: string;
  brand: string;
  size: string;
  color: string;
  cost: string;
  price: string;
  is_active: boolean;
  etiqueta: string;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

export function ProductEditModal({
  productId,
  onClose,
}: {
  productId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [product, setProduct] = useState<EditableProduct | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [qty, setQty] = useState(0);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState<"adjustment" | "return">("adjustment");
  const [note, setNote] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [adjusting, startAdjust] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getProductForEdit(productId)
      .then((p) => {
        if (cancelled) return;
        setProduct(p);
        setQty(p.quantity);
        setForm({
          name: p.name,
          category: p.category ?? "",
          brand: p.brand ?? "",
          size: p.size ?? "",
          color: p.color ?? "",
          cost: String(fromCents(p.cost_cents)),
          price: String(fromCents(p.price_cents)),
          is_active: p.is_active,
          etiqueta: p.etiqueta ?? "",
        });
      })
      .catch((e) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [productId]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  function save() {
    if (!form) return;
    startSave(async () => {
      try {
        await updateProduct(productId, {
          name: form.name,
          category: form.category || null,
          brand: form.brand || null,
          size: form.size || null,
          color: form.color || null,
          cost: parseFloat(form.cost) || 0,
          price: parseFloat(form.price) || 0,
          is_active: form.is_active,
          etiqueta: form.etiqueta || null,
        });
        toast.success("Producto actualizado");
        router.refresh();
        onClose();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al guardar");
      }
    });
  }

  function applyAdjust() {
    const d = parseInt(delta, 10);
    if (!Number.isInteger(d) || d === 0) {
      toast.error("Escribe un ajuste distinto de cero");
      return;
    }
    startAdjust(async () => {
      try {
        const newQty = await adjustStock(productId, d, reason, note || null);
        setQty(newQty);
        setDelta("");
        setNote("");
        toast.success(`Stock ajustado a ${newQty}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al ajustar");
      }
    });
  }

  return (
    <Modal open onClose={onClose} title="Editar producto" className="max-w-2xl">
      {loadError ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {loadError}
        </p>
      ) : !form || !product ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          <p className="font-mono text-xs text-muted-foreground">{product.sku}</p>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Nombre">
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
              </Field>
            </div>
            <Field label="Categoría">
              <Input value={form.category} onChange={(e) => set("category", e.target.value)} />
            </Field>
            <Field label="Marca">
              <Input value={form.brand} onChange={(e) => set("brand", e.target.value)} />
            </Field>
            <Field label="Talla">
              <Input value={form.size} onChange={(e) => set("size", e.target.value)} />
            </Field>
            <Field label="Color">
              <Input value={form.color} onChange={(e) => set("color", e.target.value)} />
            </Field>
            <Field label="Costo (pesos)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.cost}
                onChange={(e) => set("cost", e.target.value)}
              />
            </Field>
            <Field label="Precio de venta (pesos)">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(e) => set("price", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Etiqueta (opcional)">
            <Input
              value={form.etiqueta}
              onChange={(e) => set("etiqueta", e.target.value)}
              placeholder="Ej: Almacén disputa"
            />
            <span className="mt-1 block text-xs text-muted-foreground">
              Se vende normal, pero su efectivo se reporta aparte en el corte de
              caja bajo esta etiqueta. Deja vacío para producto normal.
            </span>
          </Field>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => set("is_active", e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[hsl(var(--accent))]"
            />
            Activo (visible para vender)
          </label>

          {/* Stock */}
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Stock actual</span>
              <span className="font-mono text-lg font-semibold tabular-nums">{qty}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="w-24">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Ajuste (+/−)
                </span>
                <Input
                  type="number"
                  step={1}
                  placeholder="-2"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                />
              </div>
              <div className="w-36">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Motivo
                </span>
                <Select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as "adjustment" | "return")}
                >
                  <option value="adjustment">Ajuste</option>
                  <option value="return">Devolución</option>
                </Select>
              </div>
              <div className="min-w-32 flex-1">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Nota (opcional)
                </span>
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <Button variant="secondary" onClick={applyAdjust} loading={adjusting}>
                Aplicar
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={save} loading={saving}>
              Guardar cambios
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
