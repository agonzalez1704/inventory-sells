"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MARCA } from "@/lib/marca";
import { BuscadorTienda } from "./BuscadorTienda";
import { SIN_FILTROS, urlTienda } from "./filtros";

/**
 * Desktop: the search lives in the site header, on every storefront page — a
 * customer on a product page can look for the next part without going back.
 * Not on checkout: the approved design keeps that header bare so nothing
 * pulls the customer away from paying.
 */
export function BuscadorEncabezado() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const router = useRouter();

  if (pathname.startsWith("/tienda/checkout")) return null;

  // Only the catalog URL carries a query to show; elsewhere the box starts empty.
  const q = pathname === "/tienda" ? (sp.get("q") ?? "") : "";

  return (
    <BuscadorTienda
      q={q}
      pending={false}
      placeholder={
        MARCA.id === "ruli"
          ? "Busca la pieza: amortiguador, balatas, bomba de agua…"
          : "Busca tu modelo: iPhone 11, Moto G31, Galaxy A31…"
      }
      onEnviar={(texto, cat) =>
        router.push(urlTienda(cat ? { ...SIN_FILTROS, cat: [cat] } : SIN_FILTROS, texto))
      }
    />
  );
}
