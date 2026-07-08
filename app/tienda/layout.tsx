import type { Metadata } from "next";
import Link from "next/link";
import { Poppins } from "next/font/google";
import { MonitorSmartphone } from "lucide-react";

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

function Wordmark() {
  return (
    <Link href="/tienda" className="flex items-center gap-2" aria-label="Lead Displays">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm shadow-blue-600/30">
        <MonitorSmartphone className="h-[18px] w-[18px]" />
      </span>
      <span className="text-lg font-semibold tracking-tight [font-family:var(--font-display)]">
        <span className="text-blue-700">Lead</span>{" "}
        <span className="text-slate-900">Displays</span>
      </span>
    </Link>
  );
}

export default function TiendaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${display.variable} flex min-h-screen flex-col bg-[#f5f8ff] text-slate-900`}>
      <header className="sticky top-0 z-30 border-b border-blue-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <span className="hidden text-xs font-medium text-slate-500 sm:block">
            Pantallas · Baterías · Refacciones
          </span>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-blue-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-1 px-4 py-8 text-center sm:px-6">
          <Wordmark />
          <p className="mt-2 text-xs text-slate-500">
            Para comprar o cotizar, contáctanos con el modelo que buscas.
          </p>
        </div>
      </footer>
    </div>
  );
}
