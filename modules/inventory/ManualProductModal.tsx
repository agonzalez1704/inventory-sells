"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, ImageUp, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { resizeImage } from "@/lib/image";
import { slugify } from "@/lib/slug";
import { subirImagenProducto } from "./actions";
import { addProduct } from "./import/actions";
import type { ExtractedRow } from "./import/schema";

/**
 * Built for batch capture: somebody standing at a shelf adding one part after
 * another. Everything below follows from that.
 *
 * - The photo is chosen up front (camera on phones) but uploaded only after
 *   the product exists — a failed upload never loses the product.
 * - Brand, category and inventory SURVIVE a save; name, photo and the numbers
 *   clear. A shelf is homogeneous in the first group and unique in the second,
 *   so the next part is two fields away, not nine.
 * - Quantity defaults to 1: you are holding at least one, or you would not be
 *   adding it.
 * - Enter saves. Focus returns to Nombre. No animation on any of it — this
 *   form is used dozens of times in a session, and per the frequency rule
 *   that means it gets speed, not delight.
 */
const LIMPIOS = { name: "", sku: "", size: "", color: "", cost: "", price: "", quantity: "1" };
const PEGAJOSOS = { category: "", brand: "" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function ManualProductModal({
  inventories,
  defaultInventoryId,
  verCostos,
  onClose,
}: {
  inventories: { id: string; name: string }[];
  defaultInventoryId?: string;
  verCostos: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [f, setF] = useState({ ...LIMPIOS, ...PEGAJOSOS });
  const [invId, setInvId] = useState(defaultInventoryId ?? inventories[0]?.id ?? "");
  const [foto, setFoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const nombreRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // The sku follows the name — with the SAME function the server uses when the
  // field is blank, so what the form shows is what gets written. It stops
  // following the moment the seller edits it: a hand-typed sku is information,
  // and overwriting it because the name changed would throw that away.
  const [skuManual, setSkuManual] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const setNombre = (v: string) =>
    setF((s) => ({ ...s, name: v, ...(skuManual ? {} : { sku: slugify(v) }) }));
  const canSave = f.name.trim() !== "" || f.sku.trim() !== "";
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));

  // Margin, live, while both numbers are on screen — the moment the price is
  // being decided is the only moment the margin is useful.
  const costo = num(f.cost);
  const precio = num(f.price);
  const margen =
    verCostos && costo != null && precio != null && costo > 0 && precio > 0
      ? Math.round(((precio - costo) / precio) * 100)
      : null;

  function elegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    setFoto(file);
    setPreview(URL.createObjectURL(file));
  }

  function quitarFoto() {
    if (preview) URL.revokeObjectURL(preview);
    setFoto(null);
    setPreview(null);
  }

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
    const conFoto = foto;
    start(async () => {
      try {
        const { id } = await addProduct(invId, row);

        // The product is already saved; a photo failure downgrades the toast,
        // never the save.
        let fotoOk = true;
        if (conFoto) {
          try {
            const chica = await resizeImage(conFoto);
            const form = new FormData();
            form.append("file", chica);
            const res = await subirImagenProducto(id, form);
            fotoOk = res.ok;
          } catch {
            fotoOk = false;
          }
        }
        toast.success(
          fotoOk ? "Producto agregado" : "Producto agregado — la foto no se pudo subir",
        );

        // Batch momentum: the shelf keeps its brand and category; the part
        // changes. Focus back on Nombre so the next one starts immediately.
        setF((s) => ({ ...LIMPIOS, category: s.category, brand: s.brand }));
        setSkuManual(false);
        quitarFoto();
        nombreRef.current?.focus();
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
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
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

        {/* Photo + identity share the first row: what it looks like and what
            it is called are one glance for whoever is holding the part. */}
        <div className="flex gap-3">
          <div className="relative h-[104px] w-[104px] shrink-0 overflow-hidden rounded-xl border border-dashed border-border bg-muted/30">
            {preview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Foto elegida" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={quitarFoto}
                  aria-label="Quitar foto"
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <div className="grid h-full grid-rows-2">
                <button
                  type="button"
                  onClick={() => camRef.current?.click()}
                  className="flex cursor-pointer flex-col items-center justify-center gap-0.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <Camera className="h-4 w-4" />
                  <span className="text-[10px] font-medium">Cámara</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex cursor-pointer flex-col items-center justify-center gap-0.5 border-t border-dashed border-border text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <ImageUp className="h-4 w-4" />
                  <span className="text-[10px] font-medium">Archivo</span>
                </button>
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <Field label="Nombre">
              <Input ref={nombreRef} value={f.name} onChange={(e) => setNombre(e.target.value)} autoFocus />
            </Field>
            <Field label="SKU (se genera del nombre)">
              <Input
                value={f.sku}
                onChange={(e) => {
                  setSkuManual(e.target.value.trim() !== "");
                  set("sku", e.target.value);
                }}
              />
            </Field>
          </div>
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={elegirFoto} className="hidden" />
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={elegirFoto} className="hidden" />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Marca">
            <Input value={f.brand} onChange={(e) => set("brand", e.target.value)} />
          </Field>
          <Field label="Categoría">
            <Input value={f.category} onChange={(e) => set("category", e.target.value)} />
          </Field>
          <Field label="Talla">
            <Input value={f.size} onChange={(e) => set("size", e.target.value)} />
          </Field>
          <Field label="Color">
            <Input value={f.color} onChange={(e) => set("color", e.target.value)} />
          </Field>
        </div>

        <div className={`grid gap-3 ${verCostos ? "grid-cols-3" : "grid-cols-2"}`}>
          {verCostos && (
            <Field label="Costo">
              <Input type="number" inputMode="decimal" min={0} step="0.01" value={f.cost} onChange={(e) => set("cost", e.target.value)} placeholder="$" />
            </Field>
          )}
          <Field label="Precio">
            <Input type="number" inputMode="decimal" min={0} step="0.01" value={f.price} onChange={(e) => set("price", e.target.value)} placeholder="$" />
          </Field>
          <Field label="Cantidad">
            <Input type="number" inputMode="numeric" min={0} step={1} value={f.quantity} onChange={(e) => set("quantity", e.target.value)} />
          </Field>
        </div>
        {margen !== null && (
          <p className={`text-xs ${margen < 0 ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
            Margen: {margen}%{margen < 0 ? " — el precio está abajo del costo" : ""}
          </p>
        )}

        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            Marca y categoría se conservan para el siguiente.
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Cerrar
            </Button>
            <Button type="submit" loading={pending} disabled={!canSave}>
              Agregar
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
