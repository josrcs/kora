"use client";

import { useState, useTransition } from "react";
import { DesempenoBadge } from "@/components/desempeno-badge";
import { desempenoDe, formatNota, parseNota, type Escala } from "@/lib/grading/calc";
import { guardarNotaConvivencia } from "../notas-actions";
import type { FilaNotaConvivencia } from "../server/notas";

type Estado = "idle" | "guardando" | "ok" | "error";

function Fila({ fila, periodId, escala, editable, n }: { fila: FilaNotaConvivencia; periodId: string; escala: Escala; editable: boolean; n: number }) {
  const [texto, setTexto] = useState(formatNota(fila.nota, escala.decimales));
  const [obs, setObs] = useState(fila.observacion ?? "");
  const [guardado, setGuardado] = useState({ nota: fila.nota, obs: fila.observacion ?? "" });
  const [estado, setEstado] = useState<Estado>("idle");
  const [error, setError] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  const parsed = parseNota(texto, escala);
  const valor = parsed.ok ? parsed.value : null;

  const guardar = () => {
    if (!parsed.ok) return setError(parsed.error);
    if (parsed.value === guardado.nota && obs.trim() === guardado.obs) return;
    setEstado("guardando");
    setError(null);
    iniciar(async () => {
      const r = await guardarNotaConvivencia({ enrollmentId: fila.enrollmentId, periodId, nota: parsed.value, observacion: obs.trim() || null });
      if (r.ok) {
        setGuardado({ nota: parsed.value, obs: obs.trim() });
        setTexto(formatNota(parsed.value, escala.decimales));
        setEstado("ok");
        setTimeout(() => setEstado((e) => (e === "ok" ? "idle" : e)), 1800);
      } else {
        setEstado("error");
        setError(r.error);
      }
    });
  };

  return (
    <tr className="border-t border-line transition-colors hover:bg-brand-soft/40">
      <td className="px-3 py-2 text-right text-xs text-muted tabular-nums">{n}</td>
      <td className="px-3 py-2">
        <p className="font-medium text-ink">{fila.estudiante}</p>
        <p className="font-mono text-[11px] text-muted">{fila.documento}</p>
      </td>
      <td className="px-3 py-2">
        {editable ? (
          <input
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setError(null);
            }}
            onBlur={guardar}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            inputMode="decimal"
            aria-label={`Nota de convivencia de ${fila.estudiante}`}
            aria-invalid={!parsed.ok || undefined}
            className={`celda h-9 w-20 rounded-lg border bg-surface text-center font-mono font-semibold outline-none focus-visible:ring-2 focus-visible:ring-cielo/30 ${
              !parsed.ok ? "border-bad text-bad" : valor !== null && valor < escala.aprobatoria ? "border-bad-line text-bad" : "border-line-strong"
            }`}
          />
        ) : (
          <span className={`font-mono font-semibold ${valor !== null && valor < escala.aprobatoria ? "text-bad" : ""}`}>{texto || "—"}</span>
        )}
      </td>
      <td className="px-3 py-2">
        <DesempenoBadge desempeno={desempenoDe(valor, escala)} />
      </td>
      <td className="px-3 py-2">
        {editable ? (
          <input
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            onBlur={guardar}
            maxLength={1000}
            placeholder="Observación (opcional)"
            className="h-9 w-full min-w-48 rounded-lg border border-line bg-surface px-2.5 text-[13px] outline-none focus-visible:border-cielo focus-visible:ring-2 focus-visible:ring-cielo/20"
          />
        ) : (
          <span className="text-ink-soft">{obs || "—"}</span>
        )}
      </td>
      <td className="w-28 px-3 py-2 text-xs" aria-live="polite">
        {estado === "guardando" && <span className="text-muted">Guardando…</span>}
        {estado === "ok" && <span className="anim-pop inline-block font-semibold text-ok">✓ Guardado</span>}
        {error && <span className="text-bad">{error}</span>}
      </td>
    </tr>
  );
}

export function TablaNotasConvivencia({
  filas,
  periodId,
  escala,
  editable,
}: {
  filas: FilaNotaConvivencia[];
  periodId: string;
  escala: Escala;
  editable: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-tarjeta">
      <table className="w-full text-left">
        <thead className="bg-canvas text-xs text-muted">
          <tr>
            <th className="px-3 py-2.5 text-right font-medium">#</th>
            <th className="px-3 py-2.5 font-medium">Estudiante ({filas.length})</th>
            <th className="px-3 py-2.5 font-medium">Nota</th>
            <th className="px-3 py-2.5 font-medium">Desempeño</th>
            <th className="px-3 py-2.5 font-medium">Observación</th>
            <th className="px-3 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <Fila key={`${f.enrollmentId}-${periodId}`} fila={f} periodId={periodId} escala={escala} editable={editable} n={i + 1} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
