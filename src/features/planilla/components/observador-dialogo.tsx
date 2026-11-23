"use client";

import { useEffect, useRef, useState } from "react";
import { NuevaAnotacion } from "@/features/convivencia/components/convivencia";

/**
 * Botón por estudiante en la planilla: la observación de la asignatura para el
 * boletín (se autoguarda con la planilla) y una anotación en el observador.
 * El docente solo anota sobre estudiantes de sus grupos (lo valida el servidor).
 */
export function ObservadorDialogo({
  enrollmentId,
  studentId,
  enrollmentNombre,
  observacion,
  puedeEditarObservacion,
  puedeAbrirProceso,
  onObservacion,
}: {
  enrollmentId: string;
  studentId: string;
  enrollmentNombre: string;
  observacion: string;
  puedeEditarObservacion: boolean;
  puedeAbrirProceso: boolean;
  onObservacion: (enrollmentId: string, texto: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(observacion);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  const cerrar = () => {
    if (puedeEditarObservacion) onObservacion(enrollmentId, texto.trim());
    setAbierto(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTexto(observacion);
          setAbierto(true);
        }}
        aria-label={`Observador de ${enrollmentNombre}`}
        title={observacion ? `Observación: ${observacion}` : "Observación y anotaciones"}
        className={`relative mx-auto grid size-8 place-items-center rounded-lg border ${
          observacion ? "border-petroleo/40 bg-petroleo-soft text-petroleo" : "border-line text-ink-soft hover:border-line-strong"
        }`}
      >
        <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
          <path d="M2.5 3h11v8h-6l-3 2.5V11h-2Z" />
          <path d="M8 5.5v3M6.5 7h3" />
        </svg>
      </button>
      <dialog
        ref={ref}
        onClose={() => abierto && cerrar()}
        onClick={(e) => e.target === ref.current && cerrar()}
        className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-2xl border border-line bg-canvas p-0 text-left text-[13px] font-normal tracking-normal normal-case backdrop:bg-navy/40"
      >
        {abierto && (
          <div className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted">Observador del estudiante</p>
                <h2 className="text-base font-semibold text-ink">{enrollmentNombre}</h2>
              </div>
              <button type="button" onClick={cerrar} className="rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-surface hover:text-ink">
                Cerrar
              </button>
            </div>
            <label className="block rounded-xl border border-line bg-surface p-4">
              <span className="text-xs font-semibold text-ink-soft">Observación de la asignatura (aparece en el boletín)</span>
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                readOnly={!puedeEditarObservacion}
                rows={2}
                maxLength={1000}
                placeholder="Ej.: Debe presentar plan de mejoramiento."
                className="mt-1 block w-full rounded-lg border border-line-strong bg-surface px-2 py-1.5 outline-none focus-visible:border-petroleo"
              />
              <span className="mt-1 block text-[11px] text-muted">Se guarda con la planilla al cerrar esta ventana.</span>
            </label>
            <NuevaAnotacion studentId={studentId} estudiante={enrollmentNombre} puedeAbrirProceso={puedeAbrirProceso} />
          </div>
        )}
      </dialog>
    </>
  );
}
