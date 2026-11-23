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
      className={`flex items-center gap-2 rounded-sm px-2 py-1.5 transition-colors ${
        activo ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}
