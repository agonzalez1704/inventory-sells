/**
 * A product photo, resized and cached, instead of the original.
 *
 * Deliberately NOT next/image. Every call site already sits inside its own
 * sized box with `object-contain`, and swapping in a component that needs
 * `fill` plus a positioned parent would mean re-checking eight layouts to save
 * bytes. This changes the URL and nothing else.
 *
 * `ancho` must be one of Next's configured widths — anything else is rejected
 * by the optimiser at runtime, so the buckets are spelled out here rather than
 * left to each caller to guess.
 */
export type AnchoFoto = 64 | 128 | 256 | 384 | 640 | 828;

export function foto(url: string | null | undefined, ancho: AnchoFoto): string | undefined {
  if (!url) return undefined;
  // Local assets are already served from the CDN and are not remote-patterned.
  if (!url.startsWith("http")) return url;
  return `/_next/image?url=${encodeURIComponent(url)}&w=${ancho}&q=75`;
}
