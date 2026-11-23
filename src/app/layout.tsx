import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
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

export const metadata: Metadata = {
  title: { default: "Kora · Gestión académica", template: "%s · Kora" },
  description: "Plataforma de gestión académica y calificaciones",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-CO" className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full text-[13px] leading-5">{children}</body>
    </html>
  );
}
