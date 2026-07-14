// Client-side downscale before upload. A phone photo is 3–5 MB; the storefront
// only ever renders it in a small square, so shipping the original would be
// wasted bytes for the customer and wasted storage for us.
export async function resizeImage(
  file: File,
  max = 1200,
  quality = 0.85,
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // unreadable → let the server reject it
  }

  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  // Already small enough — don't re-encode and lose quality for nothing.
  if (scale === 1 && file.size < 800_000) return file;

  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  // Flatten onto white — the storefront shows photos on a white tile.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) return file;
  return new File([blob], "foto.jpg", { type: "image/jpeg" });
}
