// Bulk-load Refaccionaria Ruli product photos from the local MEGA folders.
//
// The originals are 2500×2500 JPGs (~700 KB each, 14.6 GB total) — far beyond
// what any screen here shows (foto() tops out at 828 px). Each matched photo is
// recompressed to 1200 px WebP q80 (~35 KB) before upload, so the whole catalog
// lands in ~370 MB of Storage instead of gigabytes, and the Next image
// optimizer (1-year cache) does the serving from there.
//
// Idempotent and resumable on purpose: only products with image_url IS NULL are
// touched, so re-running after a crash — or after future catalog imports add
// SKUs that now match a MEGA photo — uploads only what is missing.
//
// Usage (Ruli only — reads creds from .insforge/negocios.json):
//   node scripts/subir-fotos-ruli.mjs           # dry run: report matches, upload nothing
//   node scripts/subir-fotos-ruli.mjs --subir   # compress + upload + update DB

import { readFileSync, readdirSync, statSync, mkdirSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAdminClient } from "@insforge/sdk";

const run = promisify(execFile);
const BUCKET = "product-images";
const CARPETAS = [
  "/Users/antoniogonzalez/MEGA/Imágenes GROB",
  "/Users/antoniogonzalez/MEGA/APYMSA",
  "/Users/antoniogonzalez/MEGA/imágenes",
];
// View-suffix priority: the front view is the card/detail photo when it exists.
const VISTA = /_(FRO|BOT|OTH|RIT|LEF|BAC)$/i;
const PRIORIDAD = { FRO: 0, RIT: 1, LEF: 2, BAC: 3, BOT: 4, OTH: 5 };
const ES_IMAGEN = /\.(jpe?g|png|webp)$/i;
const SUBIR = process.argv.includes("--subir");

const { ruli } = JSON.parse(
  readFileSync(new URL("../.insforge/negocios.json", import.meta.url), "utf8"),
);
const admin = createAdminClient({ baseUrl: ruli.oss_host, apiKey: ruli.api_key });

const rawsql = async (query) => {
  const r = await fetch(`${ruli.oss_host}/api/database/advance/rawsql/unrestricted`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ruli.api_key}` },
    body: JSON.stringify({ query }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message ?? `rawsql HTTP ${r.status}`);
  return d.rows ?? [];
};

// ---------------------------------------------------------------------------
// 1. Scan: sku (lowercased) → best local file.
//    A file's rank: front view beats other views beats nothing-special; among
//    equals the first found wins. Files named SKU_VIEW and per-SKU folders both
//    occur; "-S" files are their own SKU, not a variant.
function rango(file) {
  const m = path.parse(file).name.match(VISTA);
  return m ? PRIORIDAD[m[1].toUpperCase()] : -1; // suffix-less beats every view
}

function escanear() {
  const porSku = new Map(); // sku → { file, rank }
  const considerar = (sku, file) => {
    const r = rango(file);
    const prev = porSku.get(sku);
    if (!prev || r < prev.rank) porSku.set(sku, { file, rank: r });
  };
  for (const base of CARPETAS) {
    for (const entry of readdirSync(base)) {
      const p = path.join(base, entry);
      if (statSync(p).isDirectory()) {
        // Folder named after the SKU, views inside.
        for (const f of readdirSync(p)) {
          if (ES_IMAGEN.test(f)) considerar(entry.toLowerCase(), path.join(p, f));
        }
      } else if (ES_IMAGEN.test(entry)) {
        const sku = path.parse(entry).name.replace(VISTA, "").toLowerCase();
        considerar(sku, p);
      }
    }
  }
  return porSku;
}

// ---------------------------------------------------------------------------
async function main() {
  const local = escanear();
  console.log(`SKUs con foto local: ${local.size}`);

  const pendientes = await rawsql(
    "SELECT id, sku FROM products WHERE image_url IS NULL",
  );
  const trabajo = [];
  for (const p of pendientes) {
    const hit = local.get(p.sku.toLowerCase());
    if (hit) trabajo.push({ id: p.id, sku: p.sku, file: hit.file });
  }
  console.log(`Productos sin foto en BD: ${pendientes.length}`);
  console.log(`Match para subir: ${trabajo.length}`);
  if (!SUBIR) {
    console.log("\nDry run. Corre con --subir para ejecutar.");
    return;
  }
  if (trabajo.length === 0) return console.log("Nada pendiente.");

  const tmp = path.join(tmpdir(), "fotos-ruli");
  if (!existsSync(tmp)) mkdirSync(tmp);

  let ok = 0;
  const fallas = [];
  const hechos = []; // { id, url, key } pending DB flush

  // Flush DB updates in batches so a crash loses at most one batch of uploads'
  // pointers — the objects are already in Storage and a re-run re-does only
  // the products whose image_url stayed NULL.
  async function flush() {
    // splice BEFORE the await: other workers keep pushing while rawsql runs,
    // and a clear-after-await would silently drop their rows.
    const batch = hechos.splice(0);
    if (!batch.length) return;
    const values = batch
      .map((h) => `('${h.id}'::uuid, '${h.url}', '${h.key}')`)
      .join(",");
    await rawsql(
      `UPDATE products p SET image_url = v.url, image_key = v.key
       FROM (VALUES ${values}) AS v(id, url, key) WHERE p.id = v.id`,
    );
  }

  async function procesar(t) {
    const out = path.join(tmp, `${t.id}.webp`);
    await run("cwebp", ["-quiet", "-q", "80", "-resize", "1200", "0", t.file, "-o", out]);
    const buf = readFileSync(out);
    const key = `products/${t.id}.webp`;
    const fileObj = new File([buf], `${t.id}.webp`, { type: "image/webp" });
    const { data, error } = await admin.storage.from(BUCKET).upload(key, fileObj);
    if (error || !data) throw new Error(error?.message ?? "upload falló");
    hechos.push({ id: t.id, url: data.url, key: data.key });
  }

  const inicio = Date.now();
  const CONCURRENCIA = 8;
  let idx = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCIA }, async () => {
      while (idx < trabajo.length) {
        const t = trabajo[idx++];
        try {
          await procesar(t);
          ok++;
        } catch (e) {
          fallas.push({ sku: t.sku, error: e.message });
        }
        if (ok % 500 === 0 && ok > 0) {
          await flush().catch(() => {});
          const min = ((Date.now() - inicio) / 60000).toFixed(1);
          console.log(`  ${ok}/${trabajo.length} (${min} min)`);
        }
      }
    }),
  );
  await flush();

  console.log(`\n✓ ${ok}/${trabajo.length} fotos subidas.`);
  if (fallas.length) {
    console.log(`✗ ${fallas.length} fallas (primeras 10):`);
    for (const f of fallas.slice(0, 10)) console.log(`  ${f.sku}: ${f.error}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
