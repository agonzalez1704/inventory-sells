// Maps a catalog brand value to a logo in /public/marcas. Catalog brands are
// messy and uppercased ("REDMI XIAOMI", "OPPO RENO", "POCO"), so match by
// keyword rather than exact name. First match wins; order the sub-brands (redmi,
// poco) so they resolve to their parent's logo.
const LOGOS: { match: RegExp; src: string; alt: string }[] = [
  { match: /samsung/i, src: "/marcas/samsung.svg", alt: "Samsung" },
  { match: /xiaomi|redmi|poco/i, src: "/marcas/xiaomi.svg", alt: "Xiaomi" },
  { match: /oppo/i, src: "/marcas/oppo.svg", alt: "OPPO" },
  { match: /realme/i, src: "/marcas/realme.svg", alt: "realme" },
  { match: /motorola|moto\b/i, src: "/marcas/motorola.svg", alt: "Motorola" },
  { match: /huawei|honor/i, src: "/marcas/huawei.svg", alt: "Huawei" },
  { match: /zte/i, src: "/marcas/zte.svg", alt: "ZTE" },
  { match: /apple|iphone/i, src: "/marcas/apple.svg", alt: "Apple" },
];

export function logoDeMarca(brand: string): { src: string; alt: string } | null {
  return LOGOS.find((l) => l.match.test(brand)) ?? null;
}
