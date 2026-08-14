/**
 * Turning a model's answer into lines of a purchase order.
 *
 * Kept free of imports so it can be exercised on its own: this is the step
 * where a bad answer becomes a real order for real money, and the failure mode
 * is silent — a row number that means nothing still points at *some* product.
 */

export type CriterioCrudo = {
  candidatas: { fila: number; surtir: boolean; qty: number; motivo: string }[];
  sustitutos: { filas: number[]; motivo: string }[];
};

export type Criterio = CriterioCrudo;

/**
 * Throw away anything that does not point at a row the model was actually
 * asked about.
 *
 * Fails closed by design. The model works in row numbers rather than ids
 * precisely so that a hallucination cannot resolve to a valid product — a made
 * up uuid would be a line ordered against the wrong part, whereas a made up row
 * number simply disappears here.
 */
export function sanear(
  crudo: CriterioCrudo,
  totalFilas: number,
  filasCandidatas: number[],
): Criterio {
  const valida = (i: unknown) =>
    typeof i === "number" && Number.isInteger(i) && i >= 0 && i < totalFilas;
  const esCandidata = new Set(filasCandidatas);
  const vistas = new Set<number>();

  return {
    // Only rows flagged as candidates: everything else already has a rate, and
    // the model was told not to second-guess those. A duplicate verdict on the
    // same row is dropped rather than applied twice.
    candidatas: (crudo.candidatas ?? []).filter((c) => {
      if (!valida(c.fila) || !esCandidata.has(c.fila) || vistas.has(c.fila)) return false;
      vistas.add(c.fila);
      return true;
    }),
    sustitutos: (crudo.sustitutos ?? [])
      .map((g) => ({ ...g, filas: [...new Set((g.filas ?? []).filter(valida))] }))
      // A group of one is not a duplicate.
      .filter((g) => g.filas.length >= 2),
  };
}

type Linea = {
  sku: string;
  nombre: string;
  sugerido: number;
  fuente: string;
  motivo?: string | null;
};

export type Aplicado<T> = {
  lineas: T[];
  descartadas: { sku: string; nombre: string; motivo: string }[];
  sustitutos: { skus: string[]; motivo: string }[];
};

/**
 * Fold the verdicts back into the list.
 *
 * Substitute groups are reported, never merged: two qualities of the same
 * screen is sometimes exactly what the shop means to stock, and silently
 * dropping one would be the model overruling the buyer.
 */
export function aplicarCriterio<T extends Linea>(lineas: T[], criterio: Criterio): Aplicado<T> {
  const porFila = new Map(criterio.candidatas.map((c) => [c.fila, c]));
  const descartadas: Aplicado<T>["descartadas"] = [];
  const resultado: T[] = [];

  lineas.forEach((l, i) => {
    const c = porFila.get(i);
    if (!c) {
      resultado.push(l);
      return;
    }
    if (!c.surtir || c.qty <= 0) {
      descartadas.push({ sku: l.sku, nombre: l.nombre, motivo: c.motivo });
      return;
    }
    resultado.push({ ...l, sugerido: c.qty, fuente: "ia", motivo: c.motivo });
  });

  return {
    lineas: resultado,
    descartadas,
    sustitutos: criterio.sustitutos.map((g) => ({
      skus: g.filas.map((f) => lineas[f].sku),
      motivo: g.motivo,
    })),
  };
}
