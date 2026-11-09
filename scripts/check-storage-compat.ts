// node --experimental-strip-types scripts/check-storage-compat.ts
import assert from "node:assert/strict";
import { cubetaCompat, type SupabaseBucket } from "../lib/insforge/compat.ts";

const quitadas: string[][] = [];
let falla = false;
const fake: SupabaseBucket = {
  upload: async (key) => (falla ? { data: null, error: { message: "lleno" } } : { data: { path: key }, error: null }),
  remove: async (keys) => (quitadas.push(keys), { data: null, error: null }),
  createSignedUrl: async (key) => ({ data: { signedUrl: `firmada/${key}` }, error: null }),
  getPublicUrl: (key) => ({ data: { publicUrl: `publica/${key}` } }),
};
const c = cubetaCompat(fake);

// Callers read data.key and data.url; Supabase answers with path.
assert.deepEqual((await c.upload("a/b.webp", new Blob())).data, { key: "a/b.webp", url: "publica/a/b.webp" });
falla = true;
const r = await c.upload("x", new Blob());
assert.equal(r.data, null);
assert.equal(r.error?.message, "lleno");
// Callers pass one key; Supabase requires a list.
await c.remove("a/b.webp");
assert.deepEqual(quitadas, [["a/b.webp"]]);
assert.equal((await c.createSignedUrl("k", 60)).data?.signedUrl, "firmada/k");
console.log("check-storage-compat ok");
