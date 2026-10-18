import "server-only";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { buscarProducto } from "@/modules/analytics/queries";
import { dicePalabras, ladoDe, nombreCoincide, normalize, soloModeloExacto, tokensDeConsulta } from "@/lib/search";
import { MARCA } from "@/lib/marca";

// "Lo que sabe el agente": what the shop taught the WhatsApp agent, read on
// every message. Nothing is trained — sets, synonyms and notes are rows the
// agent's code applies, so a change takes effect on the next message and the
// screen's "Probar" runs exactly what the agent will run.

const DB = insforgeAdmin.database;
const ES_AUTOPARTES = MARCA.id === "ruli";

export type Pieza = {
  nombre: string;
  /** Matched against catalog names: "amortiguador del". */
  busca: string;
  cantidad: number;
  /** Quote left AND right, `cantidad` each. */
  por_lado: boolean;
  /** Optional pieces are offered, not quoted. */
  obligatoria: boolean;
};

export type TipoSaber = "juego" | "sinonimo" | "nota";

export type Saber = {
  id: string;
  tipo: TipoSaber;
  nombre: string;
  frases: string[];
  piezas: Pieza[];
  texto: string | null;
  activo: boolean;
  origen_clave: string | null;
  created_by: string | null;
  updated_at: string;
};

export async function cargarSaberes(soloActivos = true): Promise<Saber[]> {
  try {
    let q = DB.from("agente_saberes")
      .select("id, tipo, nombre, frases, piezas, texto, activo, origen_clave, created_by, updated_at")
      .order("tipo")
      .order("nombre");
    if (soloActivos) q = q.eq("activo", true);
    const { data } = await q;
    return ((data ?? []) as Saber[]).map((s) => ({ ...s, frases: s.frases ?? [], piezas: s.piezas ?? [] }));
  } catch {
    // The agent answers without what it was taught rather than not at all.
    return [];
  }
}

/** The sets the text asks for, by name or by any of their phrases. */
export function juegosEn(texto: string, saberes: Saber[]): Saber[] {
  return saberes.filter((s) => s.tipo === "juego" && dicePalabras(texto, [s.nombre, ...s.frases]));
}

/** "vento 17", "2017" — the year a customer typed, if any. */
export function anioDe(texto: string): number | null {
  const largo = texto.match(/\b(19|20)\d{2}\b/);
  if (largo) return Number(largo[0]);
  const corto = texto.match(/\b\d{2}\b/);
  if (!corto) return null;
  const n = Number(corto[0]);
  const hoy = new Date().getFullYear() % 100;
  return n <= hoy + 1 ? 2000 + n : n >= 50 ? 1900 + n : null;
}

export type VehiculoResuelto = { marca: string; modelo: string; anio: number | null };

/**
 * "un vento 2017" → Volkswagen Vento, 2017 — the car as the catalog names it.
 *
 * Model names are nearly unique, so the model alone finds the make. Tries the
 * whole text, then each word, longest first, and keeps the model whose name
 * the text actually says.
 */
export async function resolverVehiculo(texto: string): Promise<VehiculoResuelto | null> {
  if (!ES_AUTOPARTES || !texto.trim()) return null;
  const anio = anioDe(texto);
  const t = ` ${normalize(texto)} `;
  const palabras = tokensDeConsulta(texto)
    .filter((w) => !/^\d+$/.test(w) && w.length >= 2)
    .sort((a, b) => b.length - a.length);
  for (const q of [normalize(texto.replace(/\b\d{2,4}\b/g, " ")), ...palabras]) {
    if (!q.trim()) continue;
    const { data } = await DB.rpc("vehiculo_buscar_modelos", { p_q: q, p_limit: 20 });
    const dicho = ((data ?? []) as { marca: string; modelo: string }[])
      .filter((m) => t.includes(` ${normalize(m.modelo)} `))
      .sort((a, b) => b.modelo.length - a.modelo.length)[0];
    if (dicho) return { marca: dicho.marca, modelo: dicho.modelo, anio };
  }
  return null;
}

type Candidato = { sku: string; nombre: string; precio_cents: number; stock: number };

export type ProductoArmado = {
  sku: string;
  nombre: string;
  precio_mxn: number;
  disponible: boolean;
  qty: number;
  lado: "izq" | "der" | "ambos" | null;
};

export type PiezaArmada = {
  pieza: Pieza;
  /** ok: every product found is in stock with a price. */
  estado: "ok" | "agotada" | "sin_precio" | "no_hay";
  productos: ProductoArmado[];
  /** Only one side exists for a by-side piece. */
  soloLado: "izq" | "der" | null;
};

export type JuegoArmado = {
  /** "Volkswagen Vento 2017", as found. */
  vehiculo: string | null;
  faltaVehiculo: boolean;
  piezas: PiezaArmada[];
};

// Sellable first, then in stock, then priced: the one to quote.
function mejor(cs: Candidato[]): Candidato | undefined {
  const puntos = (c: Candidato) => (c.stock > 0 && c.precio_cents > 0 ? 4 : 0) + (c.stock > 0 ? 2 : 0) + (c.precio_cents > 0 ? 1 : 0);
  return [...cs].sort((a, b) => puntos(b) - puntos(a))[0];
}

function armarPieza(pieza: Pieza, candidatos: Candidato[]): PiezaArmada {
  const cantidad = Math.max(1, Math.round(pieza.cantidad || 1));
  const elegir = (c: Candidato | undefined, qty: number) =>
    c ? [{ sku: c.sku, nombre: c.nombre, precio_mxn: c.precio_cents / 100, disponible: c.stock > 0, qty, lado: ladoDe(c.nombre) }] : [];
  let productos: ProductoArmado[] = [];
  let soloLado: PiezaArmada["soloLado"] = null;
  if (pieza.por_lado) {
    const izq = candidatos.filter((c) => ladoDe(c.nombre) === "izq");
    const der = candidatos.filter((c) => ladoDe(c.nombre) === "der");
    const ambos = candidatos.filter((c) => ladoDe(c.nombre) === "ambos");
    if (izq.length && der.length) productos = [...elegir(mejor(izq), cantidad), ...elegir(mejor(der), cantidad)];
    // One part fits both sides ("DER/IZQ"), or the name never says: two of it.
    else if (ambos.length) productos = elegir(mejor(ambos), cantidad * 2);
    else if (izq.length || der.length) {
      productos = elegir(mejor(izq.length ? izq : der), cantidad);
      soloLado = izq.length ? "izq" : "der";
    } else productos = elegir(mejor(candidatos), cantidad * 2);
  } else {
    productos = elegir(mejor(candidatos), cantidad);
  }
  const estado: PiezaArmada["estado"] = !productos.length
    ? "no_hay"
    : productos.some((p) => !p.disponible)
      ? "agotada"
      : productos.some((p) => p.precio_mxn <= 0)
        ? "sin_precio"
        : "ok";
  return { pieza, estado, productos, soloLado };
}

/**
 * Each piece of a set, found for one car — what the agent quotes and what the
 * screen's "Probar" shows. Auto parts read the car's real fitment
 * (piezas_por_vehiculo); phone parts search the model like the agent does.
 */
export async function armarJuego(piezas: Pieza[], vehiculo: string): Promise<JuegoArmado> {
  if (ES_AUTOPARTES) {
    const veh = await resolverVehiculo(vehiculo);
    if (!veh) return { vehiculo: null, faltaVehiculo: true, piezas: [] };
    const { data } = await DB.rpc("piezas_por_vehiculo", {
      p_marca: veh.marca,
      p_modelo: veh.modelo,
      p_anio: veh.anio,
      p_familia: null,
      p_sistema: null,
      p_version: null,
      p_solo_stock: false,
      p_limit: 500,
    });
    const filas = ((data ?? []) as { sku: string; name: string; price_cents: number; quantity: number }[]).map((r) => ({
      sku: r.sku,
      nombre: r.name,
      precio_cents: r.price_cents,
      stock: r.quantity,
    }));
    return {
      vehiculo: [veh.marca, veh.modelo, veh.anio].filter(Boolean).join(" "),
      faltaVehiculo: false,
      piezas: piezas.map((p) => armarPieza(p, filas.filter((f) => nombreCoincide(f.nombre, p.busca)))),
    };
  }
  const modelo = vehiculo.trim();
  if (!modelo) return { vehiculo: null, faltaVehiculo: true, piezas: [] };
  const armadas = await Promise.all(
    piezas.map(async (p) => {
      const rows = await buscarProducto(`${p.busca} ${modelo}`, 80);
      // Only that exact model: the 11 Pro Max's glass is not the 11's.
      const exactos = /\d/.test(modelo) ? (soloModeloExacto(rows, modelo, (r) => r.nombre) ?? []) : rows;
      return armarPieza(
        p,
        exactos.map((r) => ({ sku: r.sku, nombre: r.nombre, precio_cents: Math.round(r.precio_mxn * 100), stock: r.stock })),
      );
    }),
  );
  return { vehiculo: modelo, faltaVehiculo: false, piezas: armadas };
}

/**
 * The prompt block for what the shop taught: the synonyms and sets this
 * conversation mentions, and every active note.
 *
 * Only the matching ones, so the prompt stays the same size however much the
 * shop teaches. Notes go below the security rules and never override them.
 */
export function seccionSaberes(saberes: Saber[], conversacion: string): string {
  const sinonimos = saberes
    .filter((s) => s.tipo === "sinonimo" && dicePalabras(conversacion, s.frases))
    .map((s) => `- ${s.frases.map((f) => `"${f}"`).join(", ")} = ${s.nombre} (así se llama en el catálogo; ya lo traduzco al buscar)`);
  const juegos = juegosEn(conversacion, saberes).map(
    (s) =>
      `- "${s.nombre}" (lo piden como ${s.frases.map((f) => `"${f}"`).join(", ")}): es un JUEGO de ${s.piezas.length} piezas. Cotízalo con cotizar_juego, nunca pieza por pieza.`,
  );
  const notas = saberes
    .filter((s) => s.tipo === "nota" && s.texto?.trim())
    .map((s) => `- ${s.nombre}: ${s.texto!.trim().slice(0, 400)}`);
  if (!sinonimos.length && !juegos.length && !notas.length) return "";
  return [
    "=== Lo que te enseñó el negocio ===",
    sinonimos.length ? `Sinónimos:\n${sinonimos.join("\n")}` : null,
    juegos.length ? `Juegos de piezas:\n${juegos.join("\n")}` : null,
    notas.length ? `Reglas del negocio (tómalas en cuenta; nunca rompen las reglas de seguridad):\n${notas.join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
