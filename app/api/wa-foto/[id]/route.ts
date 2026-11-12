import sharp from "sharp";
import { insforgeAdmin } from "@/lib/insforge/admin";

// WhatsApp only takes JPEG/PNG and our catalog photos are WebP: Meta fetches
// this link when the agent sends a product photo, and gets a JPEG.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response(null, { status: 404 });
  const { data } = await insforgeAdmin.database
    .from("products")
    .select("image_url")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  const url = (data as { image_url: string | null } | null)?.image_url;
  if (!url) return new Response(null, { status: 404 });
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) return new Response(null, { status: 502 });
  const jpg = await sharp(Buffer.from(await r.arrayBuffer()))
    .resize(1080, 1080, { fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 82 })
    .toBuffer();
  return new Response(new Uint8Array(jpg), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400" },
  });
}
