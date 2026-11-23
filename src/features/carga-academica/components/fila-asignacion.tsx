"use client";

import { useActionState, useEffect, useState } from "react";
import { IconCheck } from "@/components/icons";
import { asignarDirector, guardarAsignacion, quitarAsignacion } from "../actions";
import { estadoCargaInicial, type DocenteOpcion, type EstadoCarga, type FilaCarga } from "../types";

const control =
  "h-8 rounded-sm border border-line-strong bg-surface px-2 outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 disabled:bg-slate-50 disabled:text-muted";

function OpcionesDocentes({ docentes }: { docentes: DocenteOpcion[] }) {
  return (
    <>
      {docentes.map((d) => (
        <option key={d.id} value={d.id}>
          {d.nombre}
          {d.rol === "COORDINATOR" ? " (coordinación)" : ""}
        </option>
      ))}
    </>
  );
}

/** Mensaje breve de "Guardado" que se desvanece; los errores se quedan. */
function Aviso({ estado }: { estado: EstadoCarga }) {
  const [visible, setVisible] = useState(true);
  const [previo, setPrevio] = useState(estado);
  if (previo !== estado) {
    setPrevio(estado);
    setVisible(true);
  }
  useEffect(() => {
    if (!estado.ok) return;
    const t = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(t);
  }, [estado]);
  if (estado.error) {
    return (
      <p role="alert" className="text-xs text-bad">
        {estado.error}
      </p>
    );
  }
  if (estado.ok && visible) {
    return (
      <p role="status" className="flex items-center gap-1 text-xs text-ok">
        <IconCheck className="size-3.5" /> {estado.mensaje}
      </p>
    );
  }
  return null;
}

export function FilaAsignacion({ fila, groupId, docentes }: { fila: FilaCarga; groupId: string; docentes: DocenteOpcion[] }) {
  const [estado, guardar, guardando] = useActionState(guardarAsignacion, estadoCargaInicial);
  const [estadoQuitar, quitar, quitando] = useActionState(quitarAsignacion, estadoCargaInicial);
  const [docente, setDocente] = useState(fila.teacherId ?? "");
  const [ih, setIh] = useState(fila.intensidadHoraria?.toString() ?? "");

  // Si el servidor trae otro valor (otro coordinador lo cambió, o se quitó), se sincroniza.
  const [previo, setPrevio] = useState(fila);
  if (previo !== fila) {
    setPrevio(fila);
    setDocente(fila.teacherId ?? "");
    setIh(fila.intensidadHoraria?.toString() ?? "");
  }

  const cambio = docente !== (fila.teacherId ?? "") || ih !== (fila.intensidadHoraria?.toString() ?? "");
  const listo = docente !== "" && /^\d{1,2}$/.test(ih) && Number(ih) >= 1;
  const cambiaDocenteConNotas = fila.assignmentId && fila.calificaciones > 0 && docente !== fila.teacherId;
  const ultimo = estadoQuitar.error || estadoQuitar.ok ? estadoQuitar : estado;

  return (
    <tr className="border-t border-line align-top max-sm:flex max-sm:flex-wrap">
      <td className="px-4 py-2 max-sm:w-full max-sm:pb-1">
        <p className="font-medium">{fila.asignatura}</p>
        <p className="text-xs text-muted">{fila.area}</p>
      </td>
      <td className="px-2 py-2 max-sm:min-w-0 max-sm:flex-1 max-sm:pt-0 max-sm:pl-4" colSpan={3}>
        <form action={guardar} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="groupId" value={groupId} />
          <input type="hidden" name="subjectId" value={fila.subjectId} />
          <label className="sr-only" htmlFor={`doc-${fila.subjectId}`}>
            Docente de {fila.asignatura}
          </label>
          <select
            id={`doc-${fila.subjectId}`}
            name="teacherId"
            value={docente}
            onChange={(e) => setDocente(e.target.value)}
            className={`${control} w-64 max-sm:w-auto max-sm:min-w-0 max-sm:flex-1 ${docente === "" ? "text-muted" : ""}`}
          >
            <option value="">Sin docente asignado</option>
            <OpcionesDocentes docentes={docentes} />
          </select>
          <label className="sr-only" htmlFor={`ih-${fila.subjectId}`}>
            Horas semanales de {fila.asignatura}
          </label>
          <input
            id={`ih-${fila.subjectId}`}
            name="intensidadHoraria"
            inputMode="numeric"
            value={ih}
            onChange={(e) => setIh(e.target.value.replace(/\D/g, "").slice(0, 2))}
            placeholder="h"
            className={`${control} celda w-14 text-right`}
          />
          <span className="text-xs text-muted">h/sem</span>
          {cambio && (
            <button
              type="submit"
              disabled={!listo || guardando}
              className="h-8 rounded-sm bg-brand px-3 font-medium text-white hover:bg-brand-hover disabled:opacity-50"
            >
              {guardando ? "Guardando…" : fila.assignmentId ? "Guardar" : "Asignar"}
            </button>
          )}
          {cambio && (
            <button
              type="button"
              onClick={() => {
                setDocente(fila.teacherId ?? "");
                setIh(fila.intensidadHoraria?.toString() ?? "");
              }}
              className="h-8 px-1 text-xs font-medium text-muted hover:text-ink"
            >
              Deshacer
            </button>
          )}
        </form>
        {cambiaDocenteConNotas && docente !== "" && (
          <p className="mt-1 text-xs text-warn">
            Las {fila.calificaciones} calificaciones ya registradas pasan al nuevo docente, y su nombre aparecerá también en los boletines
            de periodos anteriores.
          </p>
        )}
        <div className="mt-1">
          <Aviso estado={ultimo} />
        </div>
      </td>
      <td className="px-4 py-2 text-right max-sm:pt-0 max-sm:pl-0">
        {fila.assignmentId && !cambio && (
          <form action={quitar}>
            <input type="hidden" name="assignmentId" value={fila.assignmentId} />
            <button
              type="submit"
              disabled={quitando || fila.calificaciones > 0}
              title={fila.calificaciones > 0 ? "Tiene calificaciones registradas: cambie el docente en lugar de quitarla" : undefined}
              className="h-8 text-xs font-medium text-muted hover:text-bad disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted"
            >
              {quitando ? "Quitando…" : "Quitar"}
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}

export function DirectorForm({ groupId, directorId, docentes }: { groupId: string; directorId: string | null; docentes: DocenteOpcion[] }) {
  const [estado, accion, pendiente] = useActionState(asignarDirector, estadoCargaInicial);
  const [valor, setValor] = useState(directorId ?? "");
  const [previo, setPrevio] = useState(directorId);
  if (previo !== directorId) {
    setPrevio(directorId);
    setValor(directorId ?? "");
  }
  return (
    <form action={accion} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="groupId" value={groupId} />
      <label htmlFor="director" className="text-xs font-medium text-ink-soft">
        Director de grupo
      </label>
      <select id="director" name="directorId" value={valor} onChange={(e) => setValor(e.target.value)} className={`${control} w-64 max-w-full`}>
        <option value="">Sin director</option>
        <OpcionesDocentes docentes={docentes} />
      </select>
      {valor !== (directorId ?? "") && (
        <button type="submit" disabled={pendiente} className="h-8 rounded-sm bg-brand px-3 font-medium text-white hover:bg-brand-hover disabled:opacity-50">
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
      )}
      <Aviso estado={estado} />
    </form>
  );
}
