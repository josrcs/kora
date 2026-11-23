import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Montserrat } from "next/font/google";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

/** Títulos y logotipo: geométrica y ancha, como las letras de KORA en el logo. */
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: { default: "Kora · Plataforma de gestión académica", template: "%s · Kora" },
  description: "Kora: plataforma de gestión académica, calificaciones y convivencia escolar.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-CO" className={`${plexSans.variable} ${plexMono.variable} ${montserrat.variable} h-full antialiased`}>
      <body className="min-h-full text-[13px] leading-5">{children}</body>
    </html>
  );
}
