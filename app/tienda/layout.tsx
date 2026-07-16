import type { Metadata } from "next";
import Link from "next/link";
import { Poppins } from "next/font/google";
import {
  MonitorSmartphone,
  ShieldCheck,
  Phone,
  Clock,
  MessageCircle,
  MapPin,
} from "lucide-react";
import { TIENDA } from "@/lib/tienda-info";
import { CartProvider } from "@/modules/tienda/CartProvider";
import { CartButton } from "@/modules/tienda/CartDrawer";

const display = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lead Displays — Pantallas y refacciones para celular",
  description:
    "Catálogo de pantallas, baterías y refacciones para tu celular. Explora modelos y disponibilidad.",
};

function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <Link href="/tienda" className="flex items-center gap-2" aria-label="Lead Displays">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/30">
        <MonitorSmartphone className="h-5 w-5" />
      </span>
      <span className="text-lg font-semibold tracking-tight [font-family:var(--font-display)]">
        <span className={light ? "text-blue-300" : "text-blue-700"}>Lead</span>{" "}
        <span className={light ? "text-white" : "text-slate-900"}>Displays</span>
      </span>
    </Link>
  );
}

function waHref(whatsapp: string | null) {
  const text = encodeURIComponent("Hola Lead Displays, me interesa una refacción");
  return whatsapp ? `https://wa.me/${whatsapp}?text=${text}` : `https://wa.me/?text=${text}`;
}

function prettyPhone(w: string | null): string | null {
  if (!w) return null;
  const d = w.replace(/\D/g, "");
  const local = d.startsWith("52") ? d.slice(2) : d;
  if (local.length !== 10) return `+${d}`;
  return `+52 ${local.slice(0, 2)} ${local.slice(2, 6)} ${local.slice(6)}`;
}

export default function TiendaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const whatsapp = process.env.STORE_WHATSAPP ?? null;
  const tel = prettyPhone(whatsapp);

  return (
    <CartProvider>
    <div
      className={`${display.variable} flex min-h-screen flex-col bg-[#f5f8ff] text-slate-900`}
    >
      {/* Utility bar */}
      <div className="bg-gradient-to-r from-blue-800 to-indigo-900 text-blue-50">
        <div className="mx-auto flex h-9 max-w-6xl items-center justify-between px-4 text-xs sm:px-6">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            {TIENDA.garantiaDias} días de garantía · Entrega en {TIENDA.entregaDias}
          </span>
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              <Clock className="h-3.5 w-3.5" />
              {TIENDA.horario}
            </span>
            {tel && (
              <a
                href={waHref(whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 font-medium transition-colors hover:text-white"
              >
                <Phone className="h-3.5 w-3.5" />
                {tel}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-blue-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Wordmark />
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-1.5 text-xs font-medium text-slate-500 lg:inline-flex">
              <MapPin className="h-3.5 w-3.5 text-blue-500" />
              {TIENDA.ciudad} · Envíos a todo México
            </span>
            <a
              href={waHref(whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-green-600 px-4 text-sm font-semibold text-white shadow-sm shadow-green-600/30 transition-colors hover:bg-green-700"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">WhatsApp</span>
            </a>
            <CartButton />
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="mt-8 border-t border-blue-100 bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Wordmark />
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-slate-500">
              Pantallas, baterías y refacciones para celular. Calidad original y
              genérica, con garantía.
            </p>
          </div>
          <FooterCol
            title="Catálogo"
            items={[
              ["Pantallas", "/tienda?cat=pantallas"],
              ["Todo el catálogo", "/tienda"],
            ]}
          />
          <FooterCol
            title="Ayuda"
            items={[
              ["Contacto por WhatsApp", waHref(whatsapp)],
              ["Garantía", waHref(whatsapp)],
            ]}
          />
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Contacto</h3>
            <ul className="mt-3 space-y-2 text-xs text-slate-500">
              {tel && (
                <li className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-blue-500" />
                  {tel}
                </li>
              )}
              <li className="flex items-start gap-1.5">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                {TIENDA.direccion}
              </li>
              <li className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-blue-500" />
                {TIENDA.horario}
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-blue-100">
          <p className="mx-auto max-w-6xl px-4 py-4 text-center text-xs text-slate-400 sm:px-6">
            © Lead Displays. Precios sujetos a disponibilidad.
          </p>
        </div>
      </footer>
    </div>
    </CartProvider>
  );
}

function FooterCol({
  title,
  items,
}: {
  title: string;
  items: [string, string][];
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <ul className="mt-3 space-y-2 text-xs text-slate-500">
        {items.map(([label, href]) => (
          <li key={label}>
            <Link
              href={href}
              className="transition-colors hover:text-blue-700"
              target={href.startsWith("http") ? "_blank" : undefined}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
