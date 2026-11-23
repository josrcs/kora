"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Pestañas de sección. `exacta` para la raíz de la sección (si no, "/x" marcaría también "/x/y"). */
export function SubNav({ items, label }: { items: { href: string; texto: string; exacta?: boolean }[]; label: string }) {
  const ruta = usePathname();
  return (
    <nav aria-label={label} className="-mb-px flex gap-5 overflow-x-auto">
      {items.map((i) => {
        const activo = i.exacta ? ruta === i.href : ruta.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={activo ? "page" : undefined}
            className={`shrink-0 border-b-2 pb-2 ${activo ? "border-brand font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {i.texto}
          </Link>
        );
      })}
    </nav>
  );
}
