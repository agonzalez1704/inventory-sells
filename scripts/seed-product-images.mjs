// Seed product photos into the public `product-images` bucket and set
// products.image_url / image_key. Human-in-the-loop: you approve a list of
// { id|sku, url } pairs, this downloads each source image, re-hosts it on our
// own Storage (no hotlinking), and points the product at it.
//
// Usage:
//   node --env-file=.env.local scripts/seed-product-images.mjs approved.json
//
// approved.json = [{ "sku": "S20 FE ORG C/M", "url": "https://.../img.webp" }, ...]
// Either "sku" or "id" per row. Re-running overwrites the same product's image.

import { readFileSync } from "node:fs";
import { createAdminClient } from "@insforge/sdk";

const BUCKET = "product-images";
const admin = createAdminClient({
  baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL,
  apiKey: process.env.INSFORGE_API_KEY,
});

const EXT_BY_TYPE = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/avif": "avif",
  "image/gif": "gif",
};

function extFor(contentType, url) {
  const t = (contentType || "").split(";")[0].trim().toLowerCase();
  if (EXT_BY_TYPE[t]) return EXT_BY_TYPE[t];
  const m = url.split("?")[0].match(/\.(webp|jpe?g|png|avif|gif)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

async function resolveId(row) {
  if (row.id) return row.id;
  if (!row.sku) return null;
  const { data } = await admin.database
    .from("products")
    .select("id")
    .eq("sku", row.sku)
    .maybeSingle();
  return data?.id ?? null;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Falta el archivo JSON. Uso: node ... seed-product-images.mjs approved.json");
    process.exit(1);
  }
  const rows = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(rows)) throw new Error("El JSON debe ser un arreglo");

  let ok = 0;
  const fails = [];

  for (const [i, row] of rows.entries()) {
    const label = row.sku || row.id || `#${i}`;
    try {
      const id = await resolveId(row);
      if (!id) throw new Error("producto no encontrado (sku/id)");

      const res = await fetch(row.url, {
        headers: { "user-agent": "Mozilla/5.0 (LeadDisplays image import)" },
      });
      if (!res.ok) throw new Error(`descarga HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 512) throw new Error(`imagen muy chica (${buf.length}b)`);

      const ext = extFor(res.headers.get("content-type"), row.url);
      const key = `products/${id}.${ext}`;
      const fileObj = new File([buf], `${id}.${ext}`, {
        type: res.headers.get("content-type") || `image/${ext}`,
      });

      const { data, error } = await admin.storage.from(BUCKET).upload(key, fileObj, {
        upsert: true,
      });
      if (error) throw new Error(`upload: ${error.message ?? error}`);

      const { error: upErr } = await admin.database
        .from("products")
        .update({ image_url: data.url, image_key: data.key })
        .eq("id", id);
      if (upErr) throw new Error(`db update: ${upErr.message ?? upErr}`);

      ok++;
      console.log(`✓ ${label} → ${data.url}`);
    } catch (e) {
      fails.push({ label, error: e.message });
      console.log(`✗ ${label} — ${e.message}`);
    }
  }

  console.log(`\n${ok}/${rows.length} imágenes cargadas.`);
  if (fails.length) console.log(`Fallidas: ${fails.map((f) => f.label).join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
