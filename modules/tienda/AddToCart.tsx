"use client";

import { ShoppingCart, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "./CartProvider";

// The storefront must never expose stock counts (staff-only, same rule as
// cost/SKU) — it only knows whether a piece is available. So the cart caps at a
// generic max and the REAL stock is enforced server-side by crear_orden_web,
// which locks the row and rejects the order if it can't be filled.
// 10 also happens to be what one 1 kg parcel covers (100 g per piece).
export const MAX_POR_PRODUCTO = 10;

export type AddableProduct = {
  id: string;
  nombre: string;
  precio_cents: number;
  imagen: string | null;
  disponible: boolean;
};

export function AddToCart({
  p,
  size = "sm",
  className,
}: {
  p: AddableProduct;
  size?: "sm" | "lg";
  className?: string;
}) {
  const { add, items } = useCart();
  const inCart = items.find((i) => i.id === p.id)?.qty ?? 0;
  const maxed = inCart >= MAX_POR_PRODUCTO;

  if (!p.disponible) {
    return (
      <button
        disabled
        aria-label="Agotado"
        className={cn(
          "flex items-center justify-center rounded-xl bg-slate-100 font-semibold text-slate-400",
          size === "lg" ? "h-12 w-full text-sm" : "h-9 w-9",
          className,
        )}
      >
        {size === "lg" ? "Agotado" : <ShoppingCart className="h-4 w-4" />}
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
            max: MAX_POR_PRODUCTO,
          },
          1,
        );
      }}
      disabled={maxed}
      aria-label={`Agregar ${p.nombre} al carrito`}
      title={maxed ? "Máximo por pieza en línea" : "Agregar al carrito"}
      className={cn(
        "flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 font-semibold text-white shadow-sm shadow-blue-600/30 transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none",
        size === "lg" ? "h-12 w-full text-sm" : "h-9 w-9",
        className,
      )}
    >
      {maxed ? (
        <>
          <Check className="h-4 w-4" />
          {size === "lg" && "Máximo por pieza"}
        </>
      ) : (
        <>
          <ShoppingCart className="h-4 w-4" />
          {size === "lg" && "Agregar al carrito"}
        </>
      )}
    </button>
  );
}
