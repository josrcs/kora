import type { ReactNode } from "react";

/** Contenedor de los formularios de ingreso: borde de 1px, sin sombras. */
export function Tarjeta({ paso, titulo, children }: { paso?: string; titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-sm border border-line bg-surface">
      <header className="border-b border-line px-5 py-4">
        {paso && <p className="text-[11px] font-medium uppercase tracking-wider text-muted">{paso}</p>}
        <h1 className="text-base font-semibold tracking-tight">{titulo}</h1>
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

export function Campo({
  id,
  etiqueta,
  ayuda,
  error,
  children,
}: {
  id: string;
  etiqueta: string;
  ayuda?: ReactNode;
  error?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className={`block font-medium ${error ? "text-bad" : "text-ink-soft"}`}>
        {etiqueta}
      </label>
      {children}
      {ayuda && <div className="text-xs text-muted">{ayuda}</div>}
    </div>
  );
}

export const claseInput = (error?: boolean) =>
  `block h-9 w-full rounded-sm border bg-surface px-2.5 text-[14px] text-ink outline-none placeholder:text-slate-400 ${
    error
      ? "border-bad focus-visible:ring-2 focus-visible:ring-bad/20"
      : "border-line-strong focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20"
  }`;

export function BotonPrimario({ pendiente, children, textoPendiente }: { pendiente: boolean; children: ReactNode; textoPendiente: string }) {
  return (
    <button
      type="submit"
      disabled={pendiente}
      className="flex h-9 w-full items-center justify-center rounded-sm bg-brand font-medium text-white outline-none transition-colors hover:bg-brand-hover focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
    >
      {pendiente ? textoPendiente : children}
    </button>
  );
}

export function MensajeError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-sm border border-bad-line bg-bad-soft px-3 py-2 text-bad">
      {children}
    </p>
  );
}

/** Iniciales del colegio cuando no tiene logo: "IED Jorge Isaacs" → "JI". */
export function SelloInstitucion({ nombre, logoUrl }: { nombre: string; logoUrl: string | null }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- logos externos de cada colegio, tamaño fijo
    return <img src={logoUrl} alt="" className="size-10 shrink-0 rounded-sm border border-line object-contain" />;
  }
  const iniciales = nombre
    .replace(/\b(Institución|Educativa|Distrital|Departamental|Técnica|Colegio|IED|IE|de|del|la|las|los|y)\b/gi, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
  return (
    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-sm border border-line bg-brand-soft font-semibold text-brand">
      {iniciales || "IE"}
    </span>
  );
}
