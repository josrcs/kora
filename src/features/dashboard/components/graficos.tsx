"use client";

import { useState,type FocusEvent, type PointerEvent, type ReactNode } from "react";
import { DESEMPENO_LABEL, type DesempenoCodigo } from "@/lib/grading/calc";

/**
 * Colores de los desempeños (validados con el validador de paletas: separación
 * para daltonismo y visión normal OK). Ámbar y aqua quedan bajo 3:1 contra el
 * fondo: por eso cada bloque lleva su porcentaje impreso y hay vista de tabla.
 */
const DESEMPENOS: { id: DesempenoCodigo; color: string; texto: string }[] = [
  { id: "BAJO", color: "#e34948", texto: "#ffffff" },
  { id: "BASICO", color: "#eda100", texto: "#0b0b0b" },
  { id: "ALTO", color: "#1baf7a", texto: "#0b0b0b" },
  { id: "SUPERIOR", color: "#2a78d6", texto: "#ffffff" },
];
const SERIE = "#2a78d6";

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

/** Contenedor con un único tooltip que siguen todas las marcas (hover y foco de teclado). */
function ConTooltip({ children }: { children: (props: TipProps) => ReactNode }) {
  const [tip, setTip] = useState<{ x: number; y: number; texto: string } | null>(null);
  const ubicar = (el: Element, texto: string, clientX?: number) => {
    const caja = el.closest("[data-tip-root]")?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!caja) return;
    setTip({ x: (clientX ?? r.left + r.width / 2) - caja.left, y: r.top - caja.top, texto });
  };
  const props: TipProps = {
    onPointerMove: (e, texto) => ubicar(e.currentTarget, texto, e.clientX),
    onFocus: (e, texto) => ubicar(e.currentTarget, texto),
    onLeave: () => setTip(null),
  };
  return (
    <div data-tip-root className="relative">
      {children(props)}
      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-sm bg-navy px-2 py-1 text-xs whitespace-nowrap text-white"
          style={{ left: tip.x, top: tip.y - 6 }}
        >
          {tip.texto}
        </div>
      )}
    </div>
  );
}
type TipProps = {
  onPointerMove: (e: PointerEvent<HTMLElement>, texto: string) => void;
  onFocus: (e: FocusEvent<HTMLElement>, texto: string) => void;
  onLeave: () => void;
};

export function LeyendaDesempeno() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft" aria-label="Convenciones">
      {DESEMPENOS.map((d) => (
        <li key={d.id} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px]" style={{ background: d.color }} aria-hidden />
          {DESEMPENO_LABEL[d.id]}
        </li>
      ))}
    </ul>
  );
}

/** Barra segmentada alta por grupo: reparto de las notas del periodo por desempeño. */
export function DistribucionGrupos({
  grupos,
  decimales,
}: {
  grupos: { id: string; codigo: string; conteo: Record<DesempenoCodigo, number>; total: number; promedio: number | null }[];
  decimales: 1 | 2;
}) {
  return (
    <ConTooltip>
      {(tip) => (
        <div className="space-y-2.5">
          {grupos.map((g) => (
            <div key={g.id} className="flex items-center gap-3">
              <span className="w-12 shrink-0 font-medium tabular-nums">{g.codigo}</span>
              <div
                className="flex h-7 min-w-0 flex-1 gap-0.5"
                role="img"
                aria-label={`${g.codigo}: ${DESEMPENOS.map((d) => `${DESEMPENO_LABEL[d.id]} ${pct(g.conteo[d.id], g.total)} %`).join(", ")}`}
              >
                {DESEMPENOS.map((d) => {
                  const n = g.conteo[d.id];
                  if (!n) return null;
                  const p = pct(n, g.total);
                  const texto = `${g.codigo} · ${DESEMPENO_LABEL[d.id]}: ${n} notas (${p} %)`;
                  return (
                    <div
                      key={d.id}
                      tabIndex={0}
                      aria-label={texto}
                      onPointerMove={(e) => tip.onPointerMove(e, texto)}
                      onPointerLeave={tip.onLeave}
                      onFocus={(e) => tip.onFocus(e, texto)}
                      onBlur={tip.onLeave}
                      className="flex items-center overflow-visible rounded px-1.5 text-[11px] font-medium outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand"
                      style={{ flexGrow: n, flexBasis: 0, background: d.color, color: d.texto }}
                    >
                      {/* Solo se imprime si cabe: ~6 % del ancho alcanza para "12 %". */}
                      {p >= 6 && <span aria-hidden>{p} %</span>}
                    </div>
                  );
                })}
              </div>
              <span className="w-[4.5rem] shrink-0 text-right text-xs whitespace-nowrap text-muted">
                prom. <span className="font-medium text-ink">{g.promedio?.toFixed(decimales) ?? "—"}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </ConTooltip>
  );
}

/** Barras horizontales: porcentaje de notas en desempeño bajo por asignatura. */
export function ReprobacionAsignaturas({ asignaturas }: { asignaturas: { nombre: string; total: number; reprobadas: number }[] }) {
  const max = Math.max(...asignaturas.map((a) => pct(a.reprobadas, a.total)), 1);
  return (
    <ConTooltip>
      {(tip) => (
        <div className="space-y-1.5">
          {asignaturas.map((a) => {
            const p = pct(a.reprobadas, a.total);
            const texto = `${a.nombre}: ${a.reprobadas} de ${a.total} notas en bajo (${p} %)`;
            return (
              <div
                key={a.nombre}
                tabIndex={0}
                aria-label={texto}
                onPointerMove={(e) => tip.onPointerMove(e, texto)}
                onPointerLeave={tip.onLeave}
                onFocus={(e) => tip.onFocus(e, texto)}
                onBlur={tip.onLeave}
                className="flex items-center gap-3 rounded-sm py-0.5 outline-offset-1 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand"
              >
                <span className="w-36 shrink-0 truncate text-ink-soft" title={a.nombre}>
                  {a.nombre}
                </span>
                <div className="min-w-0 flex-1">
                  {p > 0 && <div className="h-4 rounded-r" style={{ width: `${(p / max) * 100}%`, background: SERIE }} />}
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-medium whitespace-nowrap tabular-nums">{p} %</span>
              </div>
            );
          })}
        </div>
      )}
    </ConTooltip>
  );
}
