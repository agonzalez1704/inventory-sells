// Client-safe wording for a hold's window. The window itself comes from the
// database (horas_apartado); this only puts it into words.
//
// Tiers are whole hours (1, 2, 3). Anything else is "until closing", which the
// SQL computes as hours left until 20:00 CDMX — keep that hour in sync here.

export type EtiquetaApartado = {
  /** For tight spots: "2 h", "hasta las 8 pm". */
  corta: string;
  /** In a sentence: "2 horas", "hasta las 8 pm". */
  plazo: string;
  /** The button. */
  cta: string;
  /** The line under the button. */
  nota: string;
};

export function etiquetaApartado(horas: number): EtiquetaApartado {
  if (Number.isInteger(horas) && horas >= 1 && horas <= 3) {
    const t = horas === 1 ? "1 hora" : `${horas} horas`;
    return {
      corta: `${horas} h`,
      plazo: t,
      cta: `Apartar por ${t}`,
      nota: `Te lo guardamos ${t} · pagas al recoger`,
    };
  }
  return {
    // Fits the "Voy yo" segment on a phone; "hasta las 8 pm" wrapped.
    corta: "hasta 8 pm",
    plazo: "hasta las 8 pm",
    cta: "Apartar hasta las 8 pm",
    nota: "Te lo guardamos hasta las 8 pm · pagas al recoger",
  };
}
