"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { OpcionAsignacion } from "@/features/planilla/types";

const dia = (iso: string, delta: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
};

/** Elegir la clase (asignación) y la fecha. Navega con la URL para que el servidor cargue la lista. */
export function SelectorClase({ asignaciones, actualId, fecha, hoy }: { asignaciones: OpcionAsignacion[]; actualId: string; fecha: string; hoy: string }) {
  const router = useRouter();
  const [cargando, iniciar] = useTransition();
  const ir = (asignacion: string, f: string) => iniciar(() => router.push(`/docente/asistencia?asignacion=${asignacion}&fecha=${f}`));
  const grados = [...new Map(asignaciones.map((a) => [a.gradoCodigo, a.grado])).entries()];
  const muestraDocente = new Set(asignaciones.map((a) => a.docente)).size > 1;

  return (
    <div className={`flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4 shadow-tarjeta ${cargando ? "opacity-60" : ""}`} aria-busy={cargando}>
      <label className="min-w-64 flex-1 text-xs font-medium text-ink-soft">
        Clase
        <select value={actualId} onChange={(e) => ir(e.target.value, fecha)} className="mt-1 block h-10 w-full rounded-lg border border-line bg-surface px-2 text-[13px] font-medium text-ink">
          {grados.map(([codigo, nombre]) => (
            <optgroup key={codigo} label={nombre}>
              {asignaciones
                .filter((a) => a.gradoCodigo === codigo)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.grupo} · {a.asignatura}
                    {muestraDocente ? ` · ${a.docente}` : ""} ({a.estudiantes} est.)
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="text-xs font-medium text-ink-soft">
        Fecha
        <div className="mt-1 flex items-center gap-1">
          <button type="button" onClick={() => ir(actualId, dia(fecha, -1))} aria-label="Día anterior" className="grid size-10 place-items-center rounded-lg border border-line hover:border-cielo hover:text-brand">
            ‹
          </button>
          <input
            type="date"
            value={fecha}
            max={hoy}
            onChange={(e) => e.target.value && ir(actualId, e.target.value)}
            className="h-10 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink"
          />
          <button
            type="button"
            onClick={() => ir(actualId, dia(fecha, 1))}
            disabled={fecha >= hoy}
            aria-label="Día siguiente"
            className="grid size-10 place-items-center rounded-lg border border-line hover:border-cielo hover:text-brand disabled:opacity-40"
          >
            ›
          </button>
          {fecha !== hoy && (
            <button type="button" onClick={() => ir(actualId, hoy)} className="h-10 rounded-lg px-3 text-xs font-semibold text-brand hover:bg-brand-soft">
              Hoy
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
