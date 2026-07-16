"use client";

import Link from "next/link";
import { Drawer as Vaul } from "vaul";
import { ShoppingCart, Trash2, Minus, Plus, Smartphone } from "lucide-react";
import { formatMXN } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/components/use-is-mobile";
import { useCart } from "./CartProvider";

// Cart button + drawer. Bottom sheet on phones, side panel on desktop.
export function CartButton() {
  const { count, open, setOpen, ready } = useCart();
  const isMobile = useIsMobile();

  return (
    <Vaul.Root
      open={open}
      onOpenChange={setOpen}
      direction={isMobile ? "bottom" : "right"}
    >
      <Vaul.Trigger asChild>
        <button
          aria-label={`Carrito${count ? ` (${count})` : ""}`}
          className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-blue-100 bg-white text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700"
        >
          <ShoppingCart className="h-5 w-5" />
          {ready && count > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[11px] font-semibold text-white">
              {count}
            </span>
          )}
        </button>
      </Vaul.Trigger>

      <Vaul.Portal>
        <Vaul.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm" />
        <Vaul.Content
          className={cn(
            "fixed z-50 flex flex-col bg-white outline-none",
            isMobile
              ? "inset-x-0 bottom-0 max-h-[92vh] rounded-t-2xl"
              : "bottom-0 right-0 top-0 w-full max-w-md",
          )}
        >
          <CartBody mobile={isMobile} />
        </Vaul.Content>
      </Vaul.Portal>
    </Vaul.Root>
  );
}

function CartBody({ mobile }: { mobile: boolean }) {
  const { items, subtotal, setQty, remove, count, setOpen } = useCart();

  return (
    <>
      {mobile && (
        <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-slate-200" />
      )}
      <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
        <ShoppingCart className="h-5 w-5 text-blue-700" />
        <Vaul.Title className="text-sm font-semibold text-slate-900">
          Tu carrito {count > 0 && `(${count})`}
        </Vaul.Title>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-10 text-center">
          <ShoppingCart className="h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">Tu carrito está vacío</p>
          <p className="text-xs text-slate-500">Agrega refacciones desde el catálogo.</p>
        </div>
      ) : (
        <>
          <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto px-5">
            {items.map((i) => (
              <li key={i.id} className="flex gap-3 py-3">
                <span className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                  {i.imagen ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.imagen} alt={i.nombre} className="h-full w-full object-contain" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-blue-300">
                      <Smartphone className="h-6 w-6" />
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-slate-900">{i.nombre}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatMXN(i.precio_cents)} c/u
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex items-center rounded-lg border border-slate-200">
                      <button
                        onClick={() => setQty(i.id, i.qty - 1)}
                        aria-label="Quitar uno"
                        className="flex h-7 w-7 cursor-pointer items-center justify-center text-slate-500 hover:bg-slate-50"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-7 text-center text-sm tabular-nums">{i.qty}</span>
                      <button
                        onClick={() => setQty(i.id, i.qty + 1)}
                        disabled={i.qty >= i.max}
                        aria-label="Agregar uno"
                        className="flex h-7 w-7 cursor-pointer items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="ml-auto text-sm font-semibold tabular-nums text-blue-800">
                      {formatMXN(i.precio_cents * i.qty)}
                    </span>
                    <button
                      onClick={() => remove(i.id)}
                      aria-label={`Quitar ${i.nombre}`}
                      className="cursor-pointer rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div
            className="border-t border-slate-200 px-5 py-4"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-600">Subtotal</span>
              <span className="text-xl font-semibold tabular-nums text-slate-900">
                {formatMXN(subtotal)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              El envío se calcula en el siguiente paso, según tu código postal.
            </p>
            <Link
              href="/tienda/checkout"
              onClick={() => setOpen(false)}
              className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-sm shadow-blue-600/30 transition-colors hover:bg-blue-700"
            >
              Continuar al pago
            </Link>
          </div>
        </>
      )}
    </>
  );
}
