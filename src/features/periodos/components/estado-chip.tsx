import type { EstadoAvance } from "../types";

const ESTADOS: Record<EstadoAvance, [string, string]> = {
  "al-dia": ["Al día", "border-ok-line bg-ok-soft text-ok"],
  "en-curso": ["En curso", "border-warn-line bg-warn-soft text-warn"],
  "sin-empezar": ["Sin empezar", "border-bad-line bg-bad-soft text-bad"],
  "sin-estudiantes": ["Sin estudiantes", "border-line bg-surface text-muted"],
};

export function EstadoChip({ estado }: { estado: EstadoAvance }) {
  const [texto, clase] = ESTADOS[estado];
  return (
    <span className={`inline-flex h-5 min-w-[5.5rem] items-center justify-center rounded-sm border px-1.5 text-[11px] font-medium ${clase}`}>
      {texto}
    </span>
  );
}
