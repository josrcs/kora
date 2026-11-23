"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, icon, children, exacta }: { href: string; icon: ReactNode; children: ReactNode; exacta?: boolean }) {
  const ruta = usePathname();
  const activo = exacta ? ruta === href : ruta.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={activo ? "page" : undefined}
      className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors duration-200 ${
        activo
          ? "bg-gradient-to-r from-cielo/25 to-white/5 font-medium text-white"
          : "text-blue-100/70 hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      <span
        aria-hidden
        className={`absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-cielo transition-all duration-300 ${
          activo ? "opacity-100" : "scale-y-0 opacity-0 group-hover:scale-y-50 group-hover:opacity-60"
        }`}
      />
      <span className={`transition-transform duration-200 group-hover:translate-x-0.5 ${activo ? "text-cielo" : ""}`}>{icon}</span>
      {children}
    </Link>
  );
}
