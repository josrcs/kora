"use client";

import { useState } from "react";
import { crearArea, crearAsignatura, crearGrado, editarArea, editarAsignatura, eliminarArea, eliminarAsignatura, eliminarGrado } from "../actions/estructura";
import type { AreaAdmin, AsignaturaAdmin, GradoAdmin } from "../server/estructura";
import { GRADOS_ESTANDAR, NIVEL_LABEL, NIVELES } from "../types";
import { BotonConfirmado, btnTexto, campo, Desplegable, etiqueta, FormAccion } from "./ui";

export function Grados({ grados }: { grados: GradoAdmin[] }) {
  const faltantes = GRADOS_ESTANDAR.filter((g) => !grados.some((x) => x.codigo === g.codigo));
  return (
    <section aria-labelledby="grados" className="rounded-sm border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 id="grados" className="font-semibold tracking-tight">Grados que ofrece el colegio</h2>
        <p className="text-xs text-muted">Los grupos de cada año se crean sobre estos grados.</p>
      </div>
      <div className="space-y-3 px-4 py-3">
        {NIVELES.map((nivel) => {
          const delNivel = grados.filter((g) => g.nivel === nivel);
          if (!delNivel.length) return null;
          return (
            <div key={nivel} className="flex flex-wrap items-center gap-2">
              <span className="w-36 shrink-0 text-xs text-muted">{NIVEL_LABEL[nivel]}</span>
              {delNivel.map((g) => (
                <span key={g.id} className="inline-flex items-center gap-1 rounded-sm border border-line-strong bg-canvas py-0.5 pr-1 pl-2">
                  <span className="font-medium">{g.nombre}</span>
                  <span className="text-xs text-muted">· {g.grupos} grupos</span>
                  {g.grupos === 0 && (
                    <BotonConfirmado accion={eliminarGrado} campos={{ id: g.id }} texto="×" pregunta={`¿Quitar ${g.nombre}?`} confirmar="Quitar" peligro />
                  )}
                </span>
              ))}
            </div>
          );
        })}
        {grados.length === 0 && <p className="text-muted">Aún no hay grados. Agregue los que ofrece el colegio.</p>}
        {faltantes.length > 0 && (
          <FormAccion accion={crearGrado} boton="Agregar grado" className="border-t border-line pt-3">
            <label className={`${etiqueta} max-w-xs`}>
              Grado
              <select name="codigo" className={campo}>
                {faltantes.map((g) => (
                  <option key={g.codigo} value={g.codigo}>
                    {g.nombre} · {NIVEL_LABEL[g.nivel]}
                  </option>
                ))}
              </select>
            </label>
          </FormAccion>
        )}
      </div>
    </section>
  );
}

export function Areas({ areas }: { areas: AreaAdmin[] }) {
  return (
    <section aria-labelledby="areas" className="space-y-3">
      <div>
        <h2 id="areas" className="font-semibold tracking-tight">Áreas y asignaturas</h2>
        <p className="text-xs text-muted">
          Áreas obligatorias y fundamentales (Ley 115, art. 23) y sus asignaturas. El orden de las áreas es el del boletín.
        </p>
      </div>
      {areas.map((a) => (
        <TarjetaArea key={a.id} area={a} areas={areas} />
      ))}
      <Desplegable titulo="Nueva área">
        <FormAccion accion={crearArea} boton="Crear área">
          <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
            <label className={etiqueta}>
              Nombre
              <input name="nombre" required maxLength={120} placeholder="Ej.: Ciencias Naturales y Educación Ambiental" className={campo} />
            </label>
            <label className={etiqueta}>
              Orden
              <input name="orden" type="number" min={0} max={99} defaultValue={areas.length + 1} className={campo} />
            </label>
          </div>
        </FormAccion>
      </Desplegable>
    </section>
  );
}

function TarjetaArea({ area: a, areas }: { area: AreaAdmin; areas: AreaAdmin[] }) {
  const [editando, setEditando] = useState(false);
  return (
    <div className="rounded-sm border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
        <p className="font-medium">
          <span className="mr-2 text-xs text-muted tabular-nums">{a.orden}.</span>
          {a.nombre}
        </p>
        <span className="flex items-center gap-1">
          <button type="button" onClick={() => setEditando(!editando)} aria-expanded={editando} className={btnTexto}>
            {editando ? "Cerrar" : "Editar"}
          </button>
          {a.asignaturas.length === 0 && (
            <BotonConfirmado accion={eliminarArea} campos={{ id: a.id }} texto="Eliminar" pregunta="¿Eliminar el área?" confirmar="Eliminar" peligro />
          )}
        </span>
      </div>
      {editando && (
        <div className="border-b border-line bg-canvas px-4 py-3">
          <FormAccion accion={editarArea} boton="Guardar área" limpiarAlGuardar={false}>
            <input type="hidden" name="id" value={a.id} />
            <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
              <label className={etiqueta}>
                Nombre
                <input name="nombre" defaultValue={a.nombre} required maxLength={120} className={campo} />
              </label>
              <label className={etiqueta}>
                Orden
                <input name="orden" type="number" min={0} max={99} defaultValue={a.orden} className={campo} />
              </label>
            </div>
          </FormAccion>
        </div>
      )}
      <ul>
        {a.asignaturas.map((s) => (
          <FilaAsignatura key={s.id} asignatura={s} areaId={a.id} areas={areas} />
        ))}
      </ul>
      <div className="px-4 py-2">
        <AgregarAsignatura areaId={a.id} />
      </div>
    </div>
  );
}

function AgregarAsignatura({ areaId }: { areaId: string }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="text-xs font-medium text-brand hover:underline">
        + Agregar asignatura
      </button>
    );
  }
  return (
    <FormAccion accion={crearAsignatura} boton="Crear asignatura" extra={<button type="button" onClick={() => setAbierto(false)} className={btnTexto}>Cancelar</button>}>
      <input type="hidden" name="areaId" value={areaId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <label className={etiqueta}>
          Nombre
          <input name="nombre" required maxLength={100} className={campo} />
        </label>
        <label className={etiqueta}>
          Abreviatura
          <input name="abreviatura" required maxLength={8} placeholder="MAT" className={`${campo} uppercase`} />
        </label>
      </div>
    </FormAccion>
  );
}

function FilaAsignatura({ asignatura: s, areaId, areas }: { asignatura: AsignaturaAdmin; areaId: string; areas: AreaAdmin[] }) {
  const [editando, setEditando] = useState(false);
  return (
    <li className="border-b border-line last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
        <span className={`flex-1 ${s.activo ? "" : "text-muted line-through"}`}>{s.nombre}</span>
        <code className="text-xs text-muted">{s.abreviatura}</code>
        <span className="w-28 text-right text-xs text-muted">
          {s.activo ? `${s.asignaciones} asignaciones` : "Inactiva"}
        </span>
        <span className="flex items-center gap-1">
          <button type="button" onClick={() => setEditando(!editando)} aria-expanded={editando} className={btnTexto}>
            {editando ? "Cerrar" : "Editar"}
          </button>
          {s.asignaciones === 0 && (
            <BotonConfirmado
              accion={eliminarAsignatura}
              campos={{ id: s.id }}
              texto="Eliminar"
              pregunta={`¿Eliminar ${s.nombre}?`}
              confirmar="Eliminar"
              peligro
            />
          )}
        </span>
      </div>
      {editando && (
        <div className="bg-canvas px-4 py-3">
          <FormAccion accion={editarAsignatura} boton="Guardar asignatura" limpiarAlGuardar={false}>
            <input type="hidden" name="id" value={s.id} />
            <div className="grid gap-3 sm:grid-cols-[1fr_7rem_1fr_8rem]">
              <label className={etiqueta}>
                Nombre
                <input name="nombre" defaultValue={s.nombre} required maxLength={100} className={campo} />
              </label>
              <label className={etiqueta}>
                Abreviatura
                <input name="abreviatura" defaultValue={s.abreviatura} required maxLength={8} className={`${campo} uppercase`} />
              </label>
              <label className={etiqueta}>
                Área
                <select name="areaId" defaultValue={areaId} className={campo}>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className={etiqueta}>
                Estado
                <select name="activo" defaultValue={String(s.activo)} className={campo}>
                  <option value="true">Activa</option>
                  <option value="false">Inactiva</option>
                </select>
              </label>
            </div>
          </FormAccion>
        </div>
      )}
    </li>
  );
}
