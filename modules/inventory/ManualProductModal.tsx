"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { addProduct } from "./import/actions";
import type { ExtractedRow } from "./import/schema";

const EMPTY = {
  name: "",
  sku: "",
  category: "",
  brand: "",
  size: "",
  color: "",
  cost: "",
  price: "",
  quantity: "",
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

export function ManualProductModal({
  inventories,
  defaultInventoryId,
  onClose,
}: {
  inventories: { id: string; name: string }[];
  defaultInventoryId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [f, setF] = useState(EMPTY);
  const [invId, setInvId] = useState(defaultInventoryId ?? inventories[0]?.id ?? "");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof EMPTY, v: string) =>
    setF((s) => ({ ...s, [k]: v }));
  const canSave = f.name.trim() !== "" || f.sku.trim() !== "";
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

  function save() {
    if (!canSave) {
      toast.error("Escribe al menos un nombre");
      return;
    }
    const row: ExtractedRow = {
      sku: f.sku.trim(),
      name: f.name.trim() || undefined,
      category: f.category.trim() || undefined,
      brand: f.brand.trim() || undefined,
      size: f.size.trim() || undefined,
      color: f.color.trim() || undefined,
      cost: num(f.cost),
      price: num(f.price),
      quantity: num(f.quantity),
    };
    start(async () => {
      try {
        await addProduct(invId, row);
        toast.success("Producto agregado");
        setF(EMPTY);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al agregar");
      }
    });
  }

  const invName = inventories.find((i) => i.id === invId)?.name;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Agregar producto${invName && inventories.length === 1 ? ` · ${invName}` : ""}`}
      className="max-w-lg"
    >
      <div className="space-y-3">
        {inventories.length > 1 && (
          <Field label="Inventario">
            <select
              value={invId}
              onChange={(e) => setInvId(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {inventories.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Nombre">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU (opcional)">
            <Input value={f.sku} onChange={(e) => set("sku", e.target.value)} />
          </Field>
          <Field label="Categoría">
            <Input value={f.category} onChange={(e) => set("category", e.target.value)} />
          </Field>
          <Field label="Marca">
            <Input value={f.brand} onChange={(e) => set("brand", e.target.value)} />
          </Field>
          <Field label="Talla">
            <Input value={f.size} onChange={(e) => set("size", e.target.value)} />
          </Field>
          <Field label="Color">
            <Input value={f.color} onChange={(e) => set("color", e.target.value)} />
          </Field>
          <Field label="Costo (pesos)">
            <Input type="number" min={0} step="0.01" value={f.cost} onChange={(e) => set("cost", e.target.value)} />
          </Field>
          <Field label="Precio (pesos)">
            <Input type="number" min={0} step="0.01" value={f.price} onChange={(e) => set("price", e.target.value)} />
          </Field>
          <Field label="Cantidad">
            <Input type="number" min={0} step={1} value={f.quantity} onChange={(e) => set("quantity", e.target.value)} />
          </Field>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            Se queda abierto para agregar varios.
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cerrar
            </Button>
            <Button onClick={save} loading={pending} disabled={!canSave}>
              Agregar
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
