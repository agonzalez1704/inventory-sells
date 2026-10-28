"use server";

import { updateTag } from "next/cache";
import { insforgeAdmin } from "@/lib/insforge/admin";
import { assertPermiso, permisosDe } from "@/lib/auth/profile";
import { attempt, type ActionResult } from "@/lib/errors";
import { normalize } from "@/lib/search";
import { MARCA } from "@/lib/marca";

// "Catálogo": the owner works carros, refacción, sistema, marca and
// conversiones here instead of in his Excel (approved mockup:
// https://claude.ai/artifact/RtYz4UDABCDcUkbPjkBfWq). Every edit is by SKU —
// the same part can sit in more than one inventory, and they are one part.

const DB = insforgeAdmin.database;
const ES_AUTOPARTES = MARCA.id === "ruli";
const ANIO_MAX = new Date().getFullYear() + 1;

async function puedeVer(): Promise<void> {
  const perms = await permisosDe();
  if (!perms.has("admin_total") && !perms.has("inventario_ver") && !perms.has("inventario_gestionar"))
    throw new Error("Sin permiso");
}

export type FilaCatalogo = {
  id: string;
  sku: string;
  name: string;
  familia: string | null;
  familia_nombre: string | null;
  sistema: string | null;
  brand: string | null;
  price_cents: number;
  quantity: number;
  image_url: string | null;
  carros: string[];
  n_carros: number;
  n_conv: number;
};

export type FiltrosCatalogo = {
  q?: string;
  sistema?: string | null;
  familia?: string | null;
  marca?: string | null;
  falta?: "carros" | "refaccion" | "sistema" | null;
};

export async function buscarCatalogo(
  f: FiltrosCatalogo,
  offset = 0,
): Promise<ActionResult<{ filas: FilaCatalogo[]; total: number }>> {
  return attempt("buscarCatalogo", async () => {
    await puedeVer();
    const { data, error } = await DB.rpc("catalogo_buscar", {
      p_q: f.q?.trim() || null,
      p_sistema: f.sistema || null,
      p_familia: f.familia || null,
      p_marca: f.marca || null,
      p_falta: f.falta || null,
      p_limit: 50,
      p_offset: offset,
    });
    if (error) throw new Error(error.message ?? "No se pudo buscar");
    const filas = (data ?? []) as (FilaCatalogo & { total: number | string })[];
    return { filas, total: Number(filas[0]?.total ?? 0) };
  });
}

export type OpcionesCatalogo = {
  sistemas: { id: string; nombre: string }[];
  familias: { id: string; nombre: string; sistema: string | null }[];
  marcas: string[];
  pendientes: { sin_carros: number; sin_refaccion: number; sin_sistema: number };
  /** Make → its models, for the vehicle rows' suggestions. */
  vehiculos: Record<string, string[]>;
};

export async function opcionesCatalogo(): Promise<OpcionesCatalogo> {
  await puedeVer();
  const [sis, fam, pend, marcasRows, veh] = await Promise.all([
    DB.from("sistemas").select("id, nombre").order("orden"),
    DB.from("familias").select("id, nombre, sistema").order("nombre"),
    DB.rpc("catalogo_pendientes", {}),
    DB.rpc("catalogo_marcas", {}),
    ES_AUTOPARTES ? DB.rpc("catalogo_vehiculos", {}) : Promise.resolve({ data: [] }),
  ]);
  const p = ((pend.data ?? []) as Record<string, number | string>[])[0] ?? {};
  const vehiculos: Record<string, string[]> = {};
  for (const r of (veh.data ?? []) as { marca: string; modelo: string }[]) (vehiculos[r.marca] ??= []).push(r.modelo);
  return {
    sistemas: (sis.data ?? []) as OpcionesCatalogo["sistemas"],
    familias: (fam.data ?? []) as OpcionesCatalogo["familias"],
    marcas: ((marcasRows.data ?? []) as { brand: string }[]).map((r) => r.brand),
    pendientes: {
      sin_carros: Number(p.sin_carros ?? 0),
      sin_refaccion: Number(p.sin_refaccion ?? 0),
      sin_sistema: Number(p.sin_sistema ?? 0),
    },
    vehiculos,
  };
}

export type Carro = {
  marca: string;
  modelo: string;
  version: string | null;
  cilindrada: string | null;
  condicion: string | null;
  desde: number;
  hasta: number;
};

export type PiezaDetalle = {
  sku: string;
  name: string;
  descripcion: string | null;
  familia: string | null;
  sistema: string | null;
  brand: string | null;
  price_cents: number;
  quantity: number;
  carros: Carro[];
  conversiones: { sku: string; name: string; price_cents: number; quantity: number }[];
  numeros: string[];
};

async function idsDeSku(sku: string): Promise<string[]> {
  const { data } = await DB.from("products").select("id").eq("sku", sku);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

export async function detallePieza(sku: string): Promise<ActionResult<PiezaDetalle>> {
  return attempt("detallePieza", async () => {
    await puedeVer();
    const { data } = await DB.from("products")
      .select("id, sku, name, descripcion, familia, sistema, brand, price_cents, quantity, conversion_grupo, numeros_originales, product_tags(condicion, cilindrada, tags(veh_marca, veh_modelo, veh_version, veh_anio_desde, veh_anio_hasta))")
      .eq("sku", sku)
      .order("quantity", { ascending: false });
    type Fila = {
      id: string; sku: string; name: string; descripcion: string | null; familia: string | null; sistema: string | null; brand: string | null;
      price_cents: number; quantity: number; conversion_grupo: string | null; numeros_originales: string[] | null;
      product_tags: { condicion: string | null; cilindrada: string | null; tags: { veh_marca: string | null; veh_modelo: string | null; veh_version: string | null; veh_anio_desde: number | null; veh_anio_hasta: number | null } | null }[];
    };
    const filas = (data ?? []) as unknown as Fila[];
    const p = filas[0];
    if (!p) throw new Error("No encontré esa pieza");
    const vistos = new Set<string>();
    const carros: Carro[] = [];
    for (const pt of filas.flatMap((f) => f.product_tags)) {
      const t = pt.tags;
      if (!t?.veh_marca || !t.veh_modelo || t.veh_anio_desde == null) continue;
      const c: Carro = {
        marca: t.veh_marca, modelo: t.veh_modelo, version: t.veh_version, cilindrada: pt.cilindrada,
        condicion: pt.condicion, desde: t.veh_anio_desde, hasta: t.veh_anio_hasta ?? t.veh_anio_desde,
      };
      const k = `${c.marca}|${c.modelo}|${c.desde}|${c.hasta}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      carros.push(c);
    }
    carros.sort((a, b) => a.marca.localeCompare(b.marca) || a.modelo.localeCompare(b.modelo) || a.desde - b.desde);
    const grupo = filas.find((f) => f.conversion_grupo)?.conversion_grupo ?? null;
    let conversiones: PiezaDetalle["conversiones"] = [];
    if (grupo) {
      const { data: otros } = await DB.from("products")
        .select("sku, name, price_cents, quantity")
        .eq("conversion_grupo", grupo)
        .neq("sku", sku)
        .order("quantity", { ascending: false });
      const ya = new Set<string>();
      conversiones = ((otros ?? []) as PiezaDetalle["conversiones"]).filter((o) => !ya.has(o.sku) && ya.add(o.sku));
    }
    return {
      sku: p.sku, name: p.name, descripcion: p.descripcion, familia: p.familia, sistema: p.sistema, brand: p.brand,
      price_cents: p.price_cents, quantity: filas.reduce((s, f) => s + f.quantity, 0),
      carros, conversiones, numeros: p.numeros_originales ?? [],
    };
  });
}

const titulo = (s: string) =>
  s.trim().replace(/\s+/g, " ").split(" ")
    .map((w) => (/\d/.test(w) || w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ");

function limpiarCarro(c: Carro): Carro {
  const marca = titulo(c.marca);
  const modelo = titulo(c.modelo);
  const desde = Math.round(Number(c.desde));
  const hasta = Math.round(Number(c.hasta || c.desde));
  if (!modelo) throw new Error("Cada carro necesita modelo");
  if (!marca) throw new Error(`Elige de qué armadora es el ${modelo}`);
  if (!(desde >= 1950 && desde <= ANIO_MAX) || !(hasta >= desde && hasta <= ANIO_MAX))
    throw new Error(`Revisa los años de ${marca} ${modelo}: sin años no aparece en las búsquedas`);
  const txt = (v: string | null) => (v ?? "").trim().replace(/\s+/g, " ") || null;
  return { marca, modelo, desde, hasta, version: txt(c.version), cilindrada: txt(c.cilindrada)?.toUpperCase() ?? null, condicion: txt(c.condicion) };
}

/**
 * The tag for a car band, found or created. The tag's name is what the
 * vehicle columns are derived from, so it must end in years; the version is
 * the tag's own column. ponytail: the version lives on the shared band, so
 * naming it here names it for every part on that band (it IS the generation).
 */
async function tagDe(c: Carro): Promise<string> {
  const nombre = `${c.marca} ${c.modelo} ${c.desde === c.hasta ? c.desde : `${c.desde}-${c.hasta}`}`;
  const norm = normalize(nombre);
  const { data: hay } = await DB.from("tags").select("id, veh_version").eq("nombre_norm", norm).maybeSingle();
  const tag = hay as { id: string; veh_version: string | null } | null;
  if (tag) {
    if (c.version && tag.veh_version !== c.version) await DB.from("tags").update({ veh_version: c.version }).eq("id", tag.id);
    return tag.id;
  }
  const { data, error } = await DB.from("tags").insert([{ nombre, nombre_norm: norm, veh_version: c.version }]).select("id").single();
  if (error || !data) {
    // Created meanwhile by another save: read it back.
    const { data: otra } = await DB.from("tags").select("id").eq("nombre_norm", norm).maybeSingle();
    if (otra) return (otra as { id: string }).id;
    throw new Error(error?.message ?? "No se pudo guardar el carro");
  }
  return (data as { id: string }).id;
}

/** Vehicle tags of these products, by tag id. */
async function carrosActuales(ids: string[]): Promise<Map<string, Set<string>>> {
  const { data } = await DB.from("product_tags").select("product_id, tag_id, tags(veh_marca)").in("product_id", ids);
  const m = new Map<string, Set<string>>();
  for (const r of (data ?? []) as unknown as { product_id: string; tag_id: string; tags: { veh_marca: string | null } | null }[]) {
    if (!r.tags?.veh_marca) continue;
    (m.get(r.product_id) ?? m.set(r.product_id, new Set()).get(r.product_id)!).add(r.tag_id);
  }
  return m;
}

async function ponerCarros(ids: string[], carros: { tagId: string; c: Carro }[], quitarOtros: boolean): Promise<void> {
  const actuales = await carrosActuales(ids);
  const quiero = new Set(carros.map((x) => x.tagId));
  for (const id of ids) {
    const tiene = actuales.get(id) ?? new Set<string>();
    if (quitarOtros) {
      const sobran = [...tiene].filter((t) => !quiero.has(t));
      if (sobran.length) await DB.from("product_tags").delete().eq("product_id", id).in("tag_id", sobran);
    }
    const nuevos = carros.filter((x) => !tiene.has(x.tagId));
    if (nuevos.length) {
      const { error } = await DB.from("product_tags").insert(
        nuevos.map((x) => ({ product_id: id, tag_id: x.tagId, condicion: x.c.condicion, cilindrada: x.c.cilindrada })),
      );
      if (error) throw new Error(error.message ?? "No se pudieron guardar los carros");
    }
    // Engine and condition belong to the fit: refresh them on the ones kept.
    for (const x of carros.filter((x) => tiene.has(x.tagId))) {
      await DB.from("product_tags").update({ condicion: x.c.condicion, cilindrada: x.c.cilindrada }).eq("product_id", id).eq("tag_id", x.tagId);
    }
  }
}

async function nombreFamilia(id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await DB.from("familias").select("nombre").eq("id", id).maybeSingle();
  return (data as { nombre: string } | null)?.nombre ?? null;
}

async function ponerCampos(skus: string[], campos: { familia?: string | null; sistema?: string | null; brand?: string | null }): Promise<void> {
  const fila: Record<string, unknown> = {};
  if (campos.familia !== undefined) {
    fila.familia = campos.familia;
    fila.familia_fija = campos.familia !== null;
    // In the auto parts shop the category IS the refacción (the old Línea is
    // retired): the register and the store read it from there.
    if (ES_AUTOPARTES && campos.familia) fila.category = await nombreFamilia(campos.familia);
  }
  if (campos.sistema !== undefined) fila.sistema = campos.sistema;
  if (campos.brand !== undefined) fila.brand = campos.brand ? campos.brand.trim().toUpperCase() : null;
  if (!Object.keys(fila).length) return;
  const { error } = await DB.from("products").update(fila).in("sku", skus);
  if (error) throw new Error(error.message ?? "No se pudo guardar");
}

export async function guardarPieza(input: {
  sku: string;
  name: string;
  descripcion: string | null;
  familia: string | null;
  sistema: string | null;
  brand: string | null;
  carros: Carro[] | null;
  numeros: string[];
}): Promise<ActionResult<null>> {
  return attempt("guardarPieza", async () => {
    await assertPermiso("inventario_gestionar");
    const ids = await idsDeSku(input.sku);
    if (!ids.length) throw new Error("No encontré esa pieza");
    const name = input.name.replace(/\s+/g, " ").trim();
    if (!name) throw new Error("La pieza necesita nombre");
    const { error } = await DB.from("products")
      .update({ name: name.slice(0, 200), descripcion: input.descripcion?.trim().slice(0, 4000) || null })
      .in("id", ids);
    if (error) throw new Error(error.message ?? "No se pudo guardar");
    await ponerCampos([input.sku], { familia: input.familia, sistema: input.sistema, brand: input.brand });
    const numeros = [...new Set(input.numeros.map((n) => n.trim().toUpperCase()).filter(Boolean))].slice(0, 30);
    await DB.from("products").update({ numeros_originales: numeros }).in("id", ids);
    if (input.carros) {
      const limpios = input.carros.map(limpiarCarro);
      const conTag = await Promise.all(limpios.map(async (c) => ({ tagId: await tagDe(c), c })));
      await ponerCarros(ids, conTag, true);
    }
    updateTag("tienda");
    return null;
  });
}

/** "Poner refacción / sistema / marca" on the selected parts. */
export async function asignarEnLote(
  skus: string[],
  campo: "familia" | "sistema" | "brand",
  valor: string | null,
): Promise<ActionResult<null>> {
  return attempt("asignarEnLote", async () => {
    await assertPermiso("inventario_gestionar");
    if (!skus.length) throw new Error("Selecciona piezas");
    await ponerCampos(skus.slice(0, 500), { [campo]: valor });
    updateTag("tienda");
    return null;
  });
}

/**
 * "Aplicar carros": a grid of cars × selected parts. Each row says which of
 * the selected parts carry that car; a part not ticked loses it.
 */
export async function aplicarCarros(
  skus: string[],
  filas: { carro: Carro; skus: string[] }[],
): Promise<ActionResult<{ agregados: number; quitados: number }>> {
  return attempt("aplicarCarros", async () => {
    await assertPermiso("inventario_gestionar");
    let agregados = 0;
    let quitados = 0;
    const idsPorSku = new Map(await Promise.all(skus.map(async (s) => [s, await idsDeSku(s)] as const)));
    for (const f of filas) {
      const c = limpiarCarro(f.carro);
      const tagId = await tagDe(c);
      const con = new Set(f.skus);
      for (const s of skus) {
        const ids = idsPorSku.get(s) ?? [];
        const actuales = await carrosActuales(ids);
        const tiene = ids.some((id) => actuales.get(id)?.has(tagId));
        if (con.has(s)) {
          if (!tiene) agregados++;
          await ponerCarros(ids, [{ tagId, c }], false);
        } else if (tiene) {
          quitados++;
          await DB.from("product_tags").delete().in("product_id", ids).eq("tag_id", tagId);
        }
      }
    }
    updateTag("tienda");
    return { agregados, quitados };
  });
}

/** Link two parts as the same part. Groups merge: A=B and B=C makes A=C. */
export async function ligarConversion(sku: string, otro: string): Promise<ActionResult<null>> {
  return attempt("ligarConversion", async () => {
    await assertPermiso("inventario_gestionar");
    if (sku === otro) throw new Error("Es la misma pieza");
    const { data } = await DB.from("products").select("sku, conversion_grupo").in("sku", [sku, otro]);
    const filas = (data ?? []) as { sku: string; conversion_grupo: string | null }[];
    if (!filas.some((f) => f.sku === otro)) throw new Error("No encontré esa clave");
    const grupos = [...new Set(filas.map((f) => f.conversion_grupo).filter(Boolean))] as string[];
    const grupo = grupos[0] ?? crypto.randomUUID();
    await DB.from("products").update({ conversion_grupo: grupo }).in("sku", [sku, otro]);
    for (const g of grupos.slice(1)) await DB.from("products").update({ conversion_grupo: grupo }).eq("conversion_grupo", g);
    return null;
  });
}

export async function desligarConversion(sku: string, otro: string): Promise<ActionResult<null>> {
  return attempt("desligarConversion", async () => {
    await assertPermiso("inventario_gestionar");
    await DB.from("products").update({ conversion_grupo: null }).eq("sku", otro);
    // A group of one is no group.
    const { data } = await DB.from("products").select("sku, conversion_grupo").eq("sku", sku).maybeSingle();
    const g = (data as { conversion_grupo: string | null } | null)?.conversion_grupo;
    if (g) {
      const { data: resto } = await DB.from("products").select("sku").eq("conversion_grupo", g);
      if (new Set(((resto ?? []) as { sku: string }[]).map((r) => r.sku)).size < 2)
        await DB.from("products").update({ conversion_grupo: null }).eq("conversion_grupo", g);
    }
    return null;
  });
}

/** What the POS sheet shows: the same part under other claves. */
export async function descripcionDe(productId: string): Promise<string | null> {
  await puedeVer();
  const { data } = await DB.from("products").select("descripcion").eq("id", productId).maybeSingle();
  return (data as { descripcion: string | null } | null)?.descripcion ?? null;
}

export async function conversionesDe(productId: string): Promise<PiezaDetalle["conversiones"]> {
  await puedeVer();
  const { data } = await DB.from("products").select("sku, conversion_grupo").eq("id", productId).maybeSingle();
  const p = data as { sku: string; conversion_grupo: string | null } | null;
  if (!p?.conversion_grupo) return [];
  const { data: otros } = await DB.from("products")
    .select("sku, name, price_cents, quantity")
    .eq("conversion_grupo", p.conversion_grupo)
    .neq("sku", p.sku)
    .order("quantity", { ascending: false });
  const ya = new Set<string>();
  return ((otros ?? []) as PiezaDetalle["conversiones"]).filter((o) => !ya.has(o.sku) && ya.add(o.sku));
}

// ---------------------------------------------------------------------------
// Importar precios del SAE. The 15 MB sheet is read in the browser (Vercel
// takes 4.5 MB per request); these get its rows in slices.

export type FilaSae = { sku: string; precio: number; costo: number; ventas: number | null };
export type CambioSae = { sku: string; name: string; antes: number; despues: number };

export async function compararSae(filas: FilaSae[]): Promise<
  ActionResult<{ precios: CambioSae[]; costos: CambioSae[]; minimos: { sku: string; antes: number | null; despues: number }[]; nuevas: string[] }>
> {
  return attempt("compararSae", async () => {
    await assertPermiso("precios_gestionar");
    const skus = filas.map((f) => f.sku);
    const { data } = await DB.from("products").select("sku, name, price_cents, cost_cents, stock_minimo").in("sku", skus);
    const app = new Map<string, { name: string; price_cents: number; cost_cents: number; stock_minimo: number | null }>();
    for (const r of (data ?? []) as { sku: string; name: string; price_cents: number; cost_cents: number; stock_minimo: number | null }[])
      if (!app.has(r.sku)) app.set(r.sku, r);
    const precios: CambioSae[] = [];
    const costos: CambioSae[] = [];
    const minimos: { sku: string; antes: number | null; despues: number }[] = [];
    const nuevas: string[] = [];
    for (const f of filas) {
      const p = app.get(f.sku);
      if (!p) {
        nuevas.push(f.sku);
        continue;
      }
      if (f.precio > 0 && f.precio !== p.price_cents) precios.push({ sku: f.sku, name: p.name, antes: p.price_cents, despues: f.precio });
      if (f.costo > 0 && f.costo !== p.cost_cents) costos.push({ sku: f.sku, name: p.name, antes: p.cost_cents, despues: f.costo });
      if (f.ventas !== null) {
        const min = Math.round(f.ventas / 12);
        if (min !== p.stock_minimo) minimos.push({ sku: f.sku, antes: p.stock_minimo, despues: min });
      }
    }
    return { precios, costos, minimos, nuevas };
  });
}

export async function aplicarSae(cambios: {
  precios: { sku: string; despues: number }[];
  costos: { sku: string; despues: number }[];
  minimos: { sku: string; despues: number }[];
}): Promise<ActionResult<number>> {
  return attempt("aplicarSae", async () => {
    await assertPermiso("precios_gestionar");
    let n = 0;
    // Grouped by value: one update per distinct number instead of per part.
    const porValor = async (col: string, xs: { sku: string; despues: number }[]) => {
      const g = new Map<number, string[]>();
      for (const x of xs) (g.get(x.despues) ?? g.set(x.despues, []).get(x.despues)!).push(x.sku);
      for (const [v, skus] of g) {
        for (let i = 0; i < skus.length; i += 300) {
          const { error } = await DB.from("products").update({ [col]: v }).in("sku", skus.slice(i, i + 300));
          if (error) throw new Error(error.message ?? "No se pudo aplicar");
        }
        n += skus.length;
      }
    };
    await porValor("price_cents", cambios.precios);
    await porValor("cost_cents", cambios.costos);
    await porValor("stock_minimo", cambios.minimos);
    updateTag("tienda");
    return n;
  });
}
