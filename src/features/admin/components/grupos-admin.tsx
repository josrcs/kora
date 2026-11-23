"use client";

import { useState } from "react";
import { crearGrupo, editarGrupo, eliminarGrupo } from "../actions/grupos";
import type { GrupoAdmin, GruposAdmin } from "../server/grupos";
import { JORNADA_LABEL, JORNADAS } from "../types";
import { BotonConfirmado, btnTexto, campo, Desplegable, etiqueta, FormAccion } from "./ui";

function CamposGrupo({ grupo }: { grupo?: GrupoAdmin }) {
  return (
    <>
      <label className={etiqueta}>
        Código
        <input name="codigo" defaultValue={grupo?.codigo} required maxLength={10} placeholder="6-01" className={`${campo} uppercase`} />
      </label>
      <label className={etiqueta}>
        Jornada
        <select name="jornada" defaultValue={grupo?.jornada ?? "UNICA"} className={campo}>
          {JORNADAS.map((j) => (
            <option key={j} value={j}>
              {JORNADA_LABEL[j]}
            </option>
          ))}
        </select>
      </label>
      <label className={etiqueta}>
        Capacidad
        <input name="capacidad" type="number" min={1} max={60} defaultValue={grupo?.capacidad ?? ""} placeholder="—" className={campo} />
      </label>
    </>
  );
}

export function NuevoGrupo({ data }: { data: GruposAdmin }) {
  if (!data.anio) return null;
  if (data.grados.length === 0) {
    return <p className="rounded-sm border border-line bg-surface p-4 text-muted">Primero agregue los grados en «Grados y asignaturas».</p>;
  }
  return (
    <Desplegable titulo={`Nuevo grupo en ${data.anio.anio}`}>
      <FormAccion accion={crearGrupo} boton="Crear grupo">
        <input type="hidden" name="academicYearId" value={data.anio.id} />
        <div className="grid gap-3 sm:grid-cols-4">
          <label className={etiqueta}>
            Grado
            <select name="gradeLevelId" required className={campo}>
              {data.grados.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nombre}
                </option>
              ))}
            </select>
          </label>
          <CamposGrupo />
        </div>
      </FormAccion>
    </Desplegable>
  );
}

export function TablaGrupos({ grupos }: { grupos: GrupoAdmin[] }) {
  return (
    <div className="overflow-x-auto rounded-sm border border-line bg-surface">
      <table className="w-full text-left">
        <caption className="sr-only">Grupos del año</caption>
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">Grupo</th>
            <th scope="col" className="px-2 py-2 font-medium">Grado</th>
            <th scope="col" className="px-2 py-2 font-medium">Jornada</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Matriculados</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Asignaturas</th>
            <th scope="col" className="px-2 py-2 font-medium">Director</th>
            <th scope="col" className="px-4 py-2"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => (
            <FilaGrupo key={g.id} grupo={g} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilaGrupo({ grupo: g }: { grupo: GrupoAdmin }) {
  const [editando, setEditando] = useState(false);
  const lleno = g.capacidad !== null && g.matriculados > g.capacidad;
  return (
    <>
      <tr className="border-t border-line first:border-t-0">
        <td className="px-4 py-1.5 font-medium tabular-nums">{g.codigo}</td>
        <td className="px-2 py-1.5">{g.grado}</td>
        <td className="px-2 py-1.5 text-ink-soft">{JORNADA_LABEL[g.jornada as keyof typeof JORNADA_LABEL]}</td>
        <td className={`px-2 py-1.5 text-right tabular-nums ${lleno ? "font-medium text-warn" : ""}`}>
          {g.matriculados}
          {g.capacidad !== null && <span className="text-muted"> / {g.capacidad}</span>}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">{g.asignaciones || <span className="text-warn">0</span>}</td>
        <td className="px-2 py-1.5 text-ink-soft">{g.director ?? <span className="text-muted">—</span>}</td>
        <td className="px-4 py-1.5 text-right whitespace-nowrap">
          <button type="button" onClick={() => setEditando(!editando)} aria-expanded={editando} className={btnTexto}>
            {editando ? "Cerrar" : "Editar"}
          </button>
          {g.matriculados === 0 && g.asignaciones === 0 && (
            <BotonConfirmado accion={eliminarGrupo} campos={{ id: g.id }} texto="Eliminar" pregunta={`¿Eliminar ${g.codigo}?`} confirmar="Eliminar" peligro />
          )}
        </td>
      </tr>
      {editando && (
        <tr className="bg-canvas">
          <td colSpan={7} className="px-4 py-3">
            <FormAccion accion={editarGrupo} boton="Guardar grupo" limpiarAlGuardar={false}>
              <input type="hidden" name="id" value={g.id} />
              <div className="grid gap-3 sm:grid-cols-3">
                <CamposGrupo grupo={g} />
              </div>
            </FormAccion>
          </td>
        </tr>
      )}
    </>
  );
}
