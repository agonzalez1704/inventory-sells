"use client";

import { ShoppingCart, Check, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "./CartProvider";
import { StepperPieza } from "./StepperPieza";

import { MAX_POR_PRODUCTO } from "@/lib/calidades";

export { MAX_POR_PRODUCTO };

export type AddableProduct = {
  id: string;
  nombre: string;
  precio_cents: number;
  imagen: string | null;
  disponible: boolean;
  /** Shelf cap (topeCarrito); the generic max when absent. */
  tope?: number;
};

export function AddToCart({
  p,
  size = "sm",
  abrir = true,
  className,
}: {
  p: AddableProduct;
  /** False in lists: add without opening the cart. */
  abrir?: boolean;
  /** xs exists for stacked variant rows: a 36px button in a 44px row leaves
   *  8px of air, and three of them read as one solid column. */
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const { add, items, setQty } = useCart();
  const inCart = items.find((i) => i.id === p.id)?.qty ?? 0;
  const tope = p.tope ?? MAX_POR_PRODUCTO;
  const maxed = inCart >= tope;

  // Listing card, already in the order: − qty + so it can come back out
  // from the same place it went in.
  if (size === "md" && inCart > 0 && p.disponible) {
    return (
      <div className={className} onClick={(e) => e.preventDefault()}>
        <StepperPieza qty={inCart} max={tope} nombre={p.nombre} onChange={(q) => setQty(p.id, q)} />
      </div>
    );
  }

  if (!p.disponible) {
    return (
      <button
        disabled
        aria-label="Agotado"
        className={cn(
          "flex items-center justify-center rounded-xl bg-muted font-semibold text-muted-foreground",
          size === "lg" ? "h-12 w-full text-sm" : size === "md" ? "h-10 px-3.5 text-sm" : size === "xs" ? "h-7 w-7 rounded-lg" : "h-9 w-9",
          className,
        )}
      >
        {size === "lg" || size === "md" ? "Agotado" : <ShoppingCart className={size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4"} />}
      </button>
    );
  }

  return (
    <button
      onClick={(e) => {
        // Cards are links — adding must not navigate away.
        e.preventDefault();
        e.stopPropagation();
        add(
          {
            id: p.id,
            nombre: p.nombre,
            precio_cents: p.precio_cents,
            imagen: p.imagen,
            max: tope,
          },
          1,
          abrir,
        );
      }}
      disabled={maxed}
      aria-label={`Agregar ${p.nombre} al carrito`}
      title={maxed ? "Máximo por pieza en línea" : "Agregar al carrito"}
      className={cn(
        "flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-tienda-600 font-semibold text-white shadow-sm shadow-tienda-600/30 transition-[background-color,transform] duration-150 ease-out hover:bg-tienda-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-muted disabled:shadow-none",
        size === "lg" ? "h-12 w-full text-sm" : size === "md" ? "h-10 px-3.5 text-sm" : size === "xs" ? "h-7 w-7 rounded-lg" : "h-9 w-9",
        className,
      )}
    >
      {maxed ? (
        <>
          <Check className={size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4"} />
          {size === "lg" && "Máximo por pieza"}
          {size === "md" && "Máximo"}
        </>
      ) : size === "md" ? (
        <>
          <Plus className="h-4 w-4" />
          Agregar
        </>
      ) : (
        <>
          <ShoppingCart className={size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4"} />
          {size === "lg" && "Agregar al carrito"}
        </>
      )}
    </button>
  );
}
