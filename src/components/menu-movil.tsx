"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/** Botón "Menú" (solo bajo 1024 px) que abre el menú lateral como panel; se cierra al navegar o con Esc. */
export function MenuMovil({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const ruta = usePathname();
  const [rutaPrevia, setRutaPrevia] = useState(ruta);
  if (ruta !== rutaPrevia) {
    setRutaPrevia(ruta);
    setAbierto(false);
  }
  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-expanded={abierto}
        aria-controls="menu-movil"
        className="btn-kora grid size-9 place-items-center rounded-lg border border-line-strong text-ink-soft hover:bg-brand-soft hover:text-brand"
      >
        <span className="sr-only">Abrir menú</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
          <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
        </svg>
      </button>
      {abierto && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Menú">
          <button type="button" aria-label="Cerrar menú" onClick={() => setAbierto(false)} className="anim-aparecer absolute inset-0 bg-navy/50 backdrop-blur-[2px]" />
          <div id="menu-movil" className="panel-kora anim-entrar absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col overflow-y-auto text-slate-300">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
