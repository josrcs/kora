import { DESEMPENO_LABEL, type DesempenoCodigo } from "@/lib/grading/calc";

const ESTILO: Record<DesempenoCodigo | "PENDIENTE", string> = {
  SUPERIOR: "border-ok-line bg-ok-soft text-ok",
  ALTO: "border-ok-line bg-ok-soft text-ok",
  BASICO: "border-line-strong bg-slate-50 text-ink-soft",
  BAJO: "border-bad-line bg-bad-soft text-bad",
  PENDIENTE: "border-warn-line bg-warn-soft text-warn",
};

export function DesempenoBadge({ desempeno }: { desempeno: DesempenoCodigo | "PENDIENTE" | null }) {
  if (!desempeno) return null;
  return (
    <span
      className={`inline-flex h-5 min-w-[4.75rem] items-center justify-center rounded-sm border px-1.5 text-[11px] font-medium ${ESTILO[desempeno]}`}
    >
      {desempeno === "PENDIENTE" ? "Pendiente" : DESEMPENO_LABEL[desempeno]}
    </span>
  );
}
