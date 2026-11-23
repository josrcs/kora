"use client";

import { useState } from "react";

/**
 * Promedio acumulado por curso: barras horizontales de una sola serie con
 * referencia en la nota aprobatoria. Escala fija del colegio (mín → máx),
 * no recortada, para no exagerar diferencias. Tooltip con mouse y teclado.
 */
export function PromediosCursos({
  cursos,
  min,
  max,
  aprobatoria,
  decimales,
}: {
  cursos: { id: string; codigo: string; acumulado: number | null; estudiantes: number }[];
  min: number;
  max: number;
  aprobatoria: number;
  decimales: 1 | 2;
}) {
  const [tip, setTip] = useState<string | null>(null);
  const pos = (n: number) => `${((n - min) / (max - min)) * 100}%`;
  return (
    <div className="space-y-2">
      <div className="relative ml-14 mr-12 h-4 text-[11px] text-muted" aria-hidden>
        <span className="absolute -translate-x-1/2" style={{ left: pos(aprobatoria) }}>
          aprueba {aprobatoria.toFixed(decimales)}
        </span>
      </div>
      {cursos.map((c) => {
        const texto = `${c.codigo}: promedio acumulado ${c.acumulado?.toFixed(decimales) ?? "sin notas"} · ${c.estudiantes} estudiantes`;
        return (
          <div
            key={c.id}
            tabIndex={0}
            aria-label={texto}
            onPointerEnter={() => setTip(texto)}
            onPointerLeave={() => setTip(null)}
            onFocus={() => setTip(texto)}
            onBlur={() => setTip(null)}
            className="flex items-center gap-2 rounded-sm outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand"
          >
            <span className="w-12 shrink-0 font-medium tabular-nums">{c.codigo}</span>
            <div className="relative h-5 flex-1">
              <div className="absolute inset-y-0 w-px bg-line-strong" style={{ left: pos(aprobatoria) }} aria-hidden />
              {c.acumulado !== null && (
                <div
                  className="absolute inset-y-0.5 left-0 rounded-r"
                  style={{ width: pos(c.acumulado), background: c.acumulado < aprobatoria ? "#e34948" : "#2a78d6" }}
                />
              )}
            </div>
            <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums">{c.acumulado?.toFixed(decimales) ?? "—"}</span>
          </div>
        );
      })}
      <p aria-live="polite" className="h-4 text-xs text-ink-soft">
        {tip}
      </p>
    </div>
  );
}
