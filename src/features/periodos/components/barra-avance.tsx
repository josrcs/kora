import { porcentajeAvance } from "@/lib/fechas";

/** Barra de avance de digitación. Verde al completar; el texto lleva el dato, la barra solo lo refuerza. */
export function BarraAvance({ hecho, total, className = "" }: { hecho: number; total: number; className?: string }) {
  const pct = porcentajeAvance(hecho, total);
  const color = pct === 100 ? "bg-ok" : pct === 0 ? "bg-transparent" : "bg-brand";
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${pct} % digitado`}
      className={`h-1.5 overflow-hidden rounded-full bg-slate-200 ${className}`}
    >
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
