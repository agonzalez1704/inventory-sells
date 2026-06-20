import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth, currentUser } from "@clerk/nextjs/server";
import { createInsForgeServerClient } from "@/lib/insforge/server";
import { getProfile } from "@/lib/auth/profile";
import { isAllowedEmail } from "@/lib/auth/allowlist";
import {
  InventoryPdf,
  type PdfRow,
  type PdfVariant,
} from "@/modules/inventory/InventoryPdf";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const user = await currentUser();
  if (!isAllowedEmail(user?.primaryEmailAddress?.emailAddress)) {
    return new Response("Forbidden", { status: 403 });
  }

  const variant: PdfVariant =
    new URL(request.url).searchParams.get("variant") === "public"
      ? "public"
      : "internal";

  // The internal report exposes cost + margin — admins only.
  if (variant === "internal") {
    const profile = await getProfile(userId);
    if (profile?.role !== "admin") {
      return new Response("Forbidden", { status: 403 });
    }
  }

  const insforge = await createInsForgeServerClient();
  const { data, error } = await insforge.database
    .from("products")
    .select("sku, name, category, brand, size, cost_cents, price_cents, quantity")
    .order("name", { ascending: true });

  if (error) return new Response(error.message, { status: 500 });

  const rows = (data ?? []) as PdfRow[];
  const generatedAt = new Date().toLocaleString("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
  });

  const buffer = await renderToBuffer(
    createElement(InventoryPdf, { rows, generatedAt, variant }) as Parameters<
      typeof renderToBuffer
    >[0],
  );

  const date = new Date().toISOString().slice(0, 10);
  const base = variant === "public" ? "lista-precios" : "inventario";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${base}-${date}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
