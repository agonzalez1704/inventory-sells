// Pure terminal math — shared by the register's preview and the corte.

export type Terminal = {
  id: string;
  nombre: string;
  procesador: string;
  comision_pct: number;
  iva_comision: boolean;
  cuenta: { id: string; banco: string; alias: string } | null;
};

const IVA = 0.16;

/** The rate actually charged, IVA included: 3.6% + IVA → 4.176%. */
export function comisionEfectiva(t: Pick<Terminal, "comision_pct" | "iva_comision">): number {
  return Math.round(t.comision_pct * (t.iva_comision ? 1 + IVA : 1) * 10_000) / 10_000;
}

/** The commission on a charge, in cents, rounded like the processor's statement. */
export function comisionCents(montoCents: number, pctEfectivo: number): number {
  return Math.round((montoCents * pctEfectivo) / 100);
}

/** "3.6% + IVA" */
export function textoComision(t: Pick<Terminal, "comision_pct" | "iva_comision">): string {
  return `${Number(t.comision_pct)}%${t.iva_comision ? " + IVA" : ""}`;
}
