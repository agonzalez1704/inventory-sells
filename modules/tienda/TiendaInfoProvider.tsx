"use client";

import { createContext, useContext } from "react";
import { TIENDA_VACIA, type TiendaInfo } from "@/lib/tienda-info";

// The storefront's address and terms come from the database now, and half the
// components that show them are client components. Rather than thread the
// object through every card and drawer, the layout — a server component that
// already wraps all of them — reads it once and puts it here.
//
// Same shape as CartProvider, which sits beside it in that layout.
const Ctx = createContext<TiendaInfo>(TIENDA_VACIA);

export function TiendaInfoProvider({
  valor,
  children,
}: {
  valor: TiendaInfo;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/** Never throws when there is no provider: an unconfigured shop renders empty. */
export function useTiendaInfo(): TiendaInfo {
  return useContext(Ctx);
}
