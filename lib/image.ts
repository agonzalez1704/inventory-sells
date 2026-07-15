// Client-side normalize before upload. Two jobs:
//  1. Re-encode to JPEG. iPhone photos are often HEIC (image/heic) which our
//     Storage/​storefront can't use — and the naive createImageBitmap() path
//     fails on HEIC, which was silently letting the raw HEIC through to a
//     server that then rejected it as "formato no válido".
//  2. Downscale. A phone photo is 3–5 MB; the storefront shows a small square.
//
// Decodes via an <img> element (Safari decodes HEIC there) with a fast
// createImageBitmap path, and ALWAYS outputs JPEG. Throws a clear message if
// the image can't be read at all.

async function decode(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }> {
  // Fast path — works for JPEG/PNG/WebP and, on most modern browsers, HEIC.
  try {
    const bmp = await createImageBitmap(file);
    return {
      width: bmp.width,
      height: bmp.height,
      draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
    };
  } catch {
    // Fallback — Safari can paint HEIC into an <img>, then onto a canvas.
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error("decode failed"));
        el.src = url;
      });
      return {
        width: img.naturalWidth,
        height: img.naturalHeight,
        draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export async function resizeImage(
  file: File,
  max = 1200,
  quality = 0.85,
): Promise<File> {
  let src: Awaited<ReturnType<typeof decode>>;
  try {
    src = await decode(file);
  } catch {
    throw new Error(
      "No se pudo leer la imagen. Intenta con otra foto (JPG o PNG).",
    );
  }
  if (!src.width || !src.height) {
    throw new Error("Imagen no válida.");
  }

  const scale = Math.min(1, max / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  // Flatten onto white — the storefront shows photos on a white tile.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  src.draw(ctx, w, h);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob || blob.size === 0) {
    throw new Error("No se pudo procesar la imagen.");
  }
  return new File([blob], "foto.jpg", { type: "image/jpeg" });
}
