import Image from "next/image";

/**
 * Piezas de la marca Kora. Los archivos salen del logo oficial (public/):
 *   kora-logo.png           logo completo, fondo transparente (para fondos claros)
 *   kora-emblema.png        birrete + libro + órbita, colores originales
 *   kora-emblema-claro.png  mismo emblema en blanco y azul claro (para fondos oscuros)
 */

/** Logotipo "KORA" con el trazo azul de la A, en texto (escala sin perder nitidez). */
export function Logotipo({ claro = false, className = "" }: { claro?: boolean; className?: string }) {
  return (
    <span className={`relative inline-block font-display font-extrabold tracking-[0.06em] ${claro ? "text-white" : "text-navy"} ${className}`}>
      KORA
      <svg aria-hidden viewBox="0 0 40 12" className="absolute -right-[0.06em] bottom-[0.02em] h-[0.34em] w-[0.62em] text-cielo" fill="currentColor">
        <path d="M0 12C8 4 20 1 34 2l6 10Z" />
      </svg>
    </span>
  );
}

/** Emblema + logotipo, para el menú lateral (fondo oscuro). */
export function MarcaLateral({ subtitulo = "Gestión académica" }: { subtitulo?: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <Image src="/kora-emblema-claro.png" alt="" width={34} height={34} priority className="size-[34px] shrink-0" />
      <span className="leading-none">
        <Logotipo claro className="text-[19px]" />
        <span className="mt-1 block text-[10px] font-medium tracking-wide text-blue-200/70 uppercase">{subtitulo}</span>
      </span>
    </span>
  );
}

/** Logo oficial completo (fondos claros). */
export function LogoKora({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return <Image src="/kora-logo.png" alt="Kora · Plataforma de Gestión Académica" width={1200} height={361} priority={priority} className={className} />;
}

/** Órbitas decorativas del logo, animadas (giran muy despacio). Para paneles oscuros. */
export function Orbitas({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 400 400" fill="none" className={`pointer-events-none ${className}`}>
      <g className="anim-orbita">
        <path d="M70 290C20 210 60 90 190 50c90-28 160 0 175 50" stroke="url(#kora-o1)" strokeWidth="10" strokeLinecap="round" pathLength={1} className="anim-trazo" />
      </g>
      <g className="anim-orbita-inversa">
        <path d="M330 120c50 80 10 200-120 240-90 28-160 0-175-50" stroke="url(#kora-o2)" strokeWidth="6" strokeLinecap="round" pathLength={1} className="anim-trazo" />
      </g>
      <defs>
        <linearGradient id="kora-o1" x1="0" y1="400" x2="400" y2="0">
          <stop stopColor="#2f7fea" stopOpacity="0" />
          <stop offset="0.5" stopColor="#2f7fea" stopOpacity="0.55" />
          <stop offset="1" stopColor="#7fb2ff" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="kora-o2" x1="400" y1="0" x2="0" y2="400">
          <stop stopColor="#1a4fd0" stopOpacity="0" />
          <stop offset="1" stopColor="#4d8ff5" stopOpacity="0.6" />
        </linearGradient>
      </defs>
    </svg>
  );
}
