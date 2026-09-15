import Link from "next/link";
import { SearchX } from "lucide-react";

// notFound() in /tienda/[id] and /tienda/orden/[id] lands here, inside the
// shop layout, instead of Next's bare 404 outside it.
export default function TiendaNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-tienda-50 text-tienda-600">
        <SearchX className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-lg font-semibold tracking-tight">
        Esto ya no está disponible
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        El producto o pedido que buscas no existe o se dio de baja.
      </p>
      <Link
        href="/tienda"
        className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-tienda-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-tienda-700"
      >
        Ver el catálogo
      </Link>
    </div>
  );
}
