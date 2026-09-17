// QR labels for products (/inventario redesign, part 4). The code is a plain
// link, so any phone camera opens the product even without the app's scanner.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const enlaceProducto = (origin: string, id: string) => `${origin}/inventario?p=${id}`;

/** The product id inside a scanned label (also accepts /inventario/<id>), or null. */
export function idDeCodigo(texto: string): string | null {
  try {
    const u = new URL(texto.trim());
    if (!u.pathname.startsWith("/inventario")) return null;
    const id = u.searchParams.get("p") ?? u.pathname.split("/")[2] ?? "";
    return UUID.test(id) ? id : null;
  } catch {
    return null;
  }
}
