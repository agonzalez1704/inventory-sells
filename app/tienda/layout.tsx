import type { Metadata } from "next";
import Link from "next/link";
import { Poppins } from "next/font/google";
import {
  MonitorSmartphone,
  Wrench,
  ShieldCheck,
  Phone,
  Clock,
  MessageCircle,
  MapPin,
} from "lucide-react";
import { TIENDA } from "@/lib/tienda-info";
import { CartProvider } from "@/modules/tienda/CartProvider";
import { CartButton } from "@/modules/tienda/CartDrawer";
import { MARCA } from "@/lib/marca";

const display = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  // The template names the shop once, for every page under /tienda. A product
  // page only has to say what it is — and it can't accidentally introduce
  // itself as "Fiable", which is what this app is called internally, not what
  // the storefront is called to a customer.
  title: {
    default: `${MARCA.tienda.nombre} — ${MARCA.tienda.tagline}`,
    template: `%s | ${MARCA.tienda.nombre}`,
  },
  description: MARCA.tienda.descripcion,
};

// A phone screen means nothing over a counter selling suspension parts. Keyed
// by brand here rather than stored in MARCA: an icon is a component, and
// putting components in what is otherwise plain data would drag the whole
// icon library into every module that reads a brand name.
const ICONO_TIENDA = { fiable: MonitorSmartphone, ruli: Wrench }[MARCA.id];

// Two-tone on the first space, so a two-word shop name keeps the split without
// the name having to be stored pre-cut. A single-word name simply renders whole.
const [PRIMERA, ...RESTO] = MARCA.tienda.nombre.split(" ");
const SEGUNDA = RESTO.join(" ");

function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <Link href="/tienda" className="flex items-center gap-2" aria-label={MARCA.tienda.nombre}>
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tienda-600 text-white shadow-sm shadow-tienda-600/30">
        <ICONO_TIENDA className="h-5 w-5" />
      </span>
      <span className="text-lg font-semibold tracking-tight [font-family:var(--font-display)]">
        <span className={light ? "text-tienda-300" : "text-tienda-700 dark:text-tienda-300"}>{PRIMERA}</span>
        {SEGUNDA ? " " : null}
        <span className={light ? "text-white" : "text-foreground"}>{SEGUNDA}</span>
      </span>
    </Link>
  );
}

function waHref(whatsapp: string | null) {
  const text = encodeURIComponent(`Hola ${MARCA.tienda.nombre}, me interesa una refacción`);
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
      className={`${display.variable} flex min-h-screen flex-col bg-[#f5f8ff] text-foreground`}
    >
      {/* Utility bar */}
      <div className="bg-gradient-to-r from-tienda-800 to-indigo-900 text-tienda-50">
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
      <header className="sticky top-0 z-30 border-b border-tienda-100 dark:border-tienda-900 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Wordmark />
          <div className="flex items-center gap-4">
            <span className="hidden items-center gap-1.5 text-xs font-medium text-muted-foreground lg:inline-flex">
              <MapPin className="h-3.5 w-3.5 text-tienda-500" />
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
      <footer className="mt-8 border-t border-tienda-100 dark:border-tienda-900 bg-background">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Wordmark />
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted-foreground">
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
            <h3 className="text-sm font-semibold text-foreground">Contacto</h3>
            <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
              {tel && (
                <li className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-tienda-500" />
                  {tel}
                </li>
              )}
              <li className="flex items-start gap-1.5">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tienda-500" />
                {TIENDA.direccion}
              </li>
              <li className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-tienda-500" />
                {TIENDA.horario}
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-tienda-100 dark:border-tienda-900">
          <p className="mx-auto max-w-6xl px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">
            © {MARCA.tienda.nombre}. Precios sujetos a disponibilidad.
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
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
        {items.map(([label, href]) => (
          <li key={label}>
            <Link
              href={href}
              className="transition-colors hover:text-tienda-700 dark:text-tienda-300"
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
