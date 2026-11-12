// Pure: which almacén serves how many pieces. No imports, so a script can check it.

export type Almacen = {
  product_id: string;
  nombre: string;
  almacen: string;
  existencia: number;
  precio_mxn: number;
  /** Working days until it reaches the customer; 0 = on the counter; null = nobody set it. */
  entrega_dias: number | null;
  imagen: string | null;
};

export const entregaTexto = (d: number | null) =>
  d === 0 ? "en tienda, inmediata" : d == null ? "tiempo de entrega por confirmar" : `llega en ${d} ${d === 1 ? "día hábil" : "días hábiles"}`;

/** Fill qty from the first almacén on: 4 wanted, 1 here = 1 here + 3 there. Priced rows only. */
export function repartir(almacenes: Almacen[], qty: number) {
  const lineas: (Almacen & { qty: number })[] = [];
  let falta = qty;
  for (const a of almacenes) {
    if (falta <= 0) break;
    if (a.existencia <= 0 || a.precio_mxn <= 0) continue;
    const n = Math.min(falta, a.existencia);
    lineas.push({ ...a, qty: n });
    falta -= n;
  }
  return { lineas, falta };
}
