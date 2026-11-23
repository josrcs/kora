"use client";

import { useState } from "react";
import { IconLock } from "@/components/icons";
import { fechaCorta } from "@/lib/fechas";
import { activarAnio, crearAnio, crearPeriodo, editarPeriodo, eliminarAnio, eliminarPeriodo } from "../actions/anios";
import type { AnioAdmin, PeriodoAdmin } from "../server/anios";
import { BotonConfirmado, campo, Desplegable, etiqueta, FormAccion, btnTexto } from "./ui";

export function NuevoAnio({ sugerido }: { sugerido: number }) {
  return (
    <Desplegable titulo="Nuevo año lectivo">
      <FormAccion accion={crearAnio} boton="Crear año lectivo">
        <div className="grid gap-3 sm:grid-cols-4">
          <label className={etiqueta}>
            Año
            <input name="anio" type="number" min={2000} max={2100} defaultValue={sugerido} required className={campo} />
          </label>
          <label className={etiqueta}>
            Inicio de clases
            <input name="fechaInicio" type="date" required className={campo} />
          </label>
          <label className={etiqueta}>
            Fin de clases
            <input name="fechaFin" type="date" required className={campo} />
          </label>
          <label className={etiqueta}>
            Periodos
            <select name="periodos" defaultValue="3" className={campo}>
              <option value="0">Los creo después</option>
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} iguales
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-muted">
          Con «N iguales» se reparten el 100 % y las fechas en partes iguales; luego puede ajustar cada periodo. El año se crea inactivo.
        </p>
      </FormAccion>
    </Desplegable>
  );
}

export function TarjetaAnio({ anio: a }: { anio: AnioAdmin }) {
  const suma = Math.round(a.periodos.reduce((s, p) => s + p.porcentaje, 0) * 100) / 100;
  const hayCerrados = a.periodos.some((p) => p.cerrado);
  const ultimo = a.periodos.at(-1);
  const siguiente = (a.periodos.length || 0) + 1;

  return (
    <section aria-labelledby={`anio-${a.id}`} className="rounded-sm border border-line bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`anio-${a.id}`} className="font-semibold tracking-tight">
              Año lectivo {a.anio}
            </h2>
            {a.activo ? (
              <span className="inline-flex h-5 items-center rounded-sm border border-ok-line bg-ok-soft px-1.5 text-[11px] font-medium text-ok">Activo</span>
            ) : (
              <span className="inline-flex h-5 items-center rounded-sm border border-line bg-canvas px-1.5 text-[11px] font-medium text-muted">Inactivo</span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted">
            {a.fechaInicio && a.fechaFin ? `${fechaCorta(a.fechaInicio, true)} – ${fechaCorta(a.fechaFin, true)} · ` : ""}
            {a.grupos} grupos · {a.matriculas} matrículas activas
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!a.activo && (
            <BotonConfirmado
              accion={activarAnio}
              campos={{ id: a.id }}
              texto="Activar"
              pregunta={`Planillas, portal y coordinación pasarán a trabajar con ${a.anio}.`}
              confirmar={`Activar ${a.anio}`}
            />
          )}
          {!a.activo && (
            <BotonConfirmado
              accion={eliminarAnio}
              campos={{ id: a.id }}
              texto="Eliminar"
              pregunta={`¿Eliminar el año ${a.anio} y sus periodos vacíos?`}
              confirmar="Eliminar"
              peligro
              disabled={a.grupos > 0}
              title={a.grupos > 0 ? "Tiene grupos: no se puede eliminar" : undefined}
            />
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <caption className="sr-only">Periodos del año {a.anio}</caption>
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className="px-4 py-1.5 font-medium">Periodo</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">%</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Fechas</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Plazo de notas</th>
              <th scope="col" className="px-4 py-1.5"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {a.periodos.map((p) => (
              <FilaPeriodo key={p.id} periodo={p} bloquearPorcentaje={hayCerrados} esUltimo={p.id === ultimo?.id} />
            ))}
            <tr className="border-t border-line text-xs">
              <td className="px-4 py-1.5 text-muted">Total</td>
              <td className={`px-2 py-1.5 text-right font-medium tabular-nums ${suma === 100 ? "text-ok" : "text-warn"}`}>{suma} %</td>
              <td colSpan={3} className="px-2 py-1.5 text-muted">
                {suma !== 100 && "Los porcentajes deben sumar 100 % para que el acumulado del año sea correcto."}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {a.periodos.length < 6 && (
        <div className="border-t border-line p-3">
          <Desplegable titulo={`Agregar periodo ${siguiente}`}>
            <FormAccion accion={crearPeriodo} boton="Agregar periodo">
              <input type="hidden" name="academicYearId" value={a.id} />
              <CamposPeriodo
                nombre={`Periodo ${siguiente}`}
                porcentaje={suma < 100 ? String(Math.round((100 - suma) * 100) / 100) : ""}
                inicio={ultimo ? siguienteDia(ultimo.fechaFin) : (a.fechaInicio ?? "")}
                fin={a.fechaFin ?? ""}
                limite=""
              />
            </FormAccion>
          </Desplegable>
        </div>
      )}
    </section>
  );
}

function siguienteDia(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function CamposPeriodo(p: { nombre: string; porcentaje: string; inicio: string; fin: string; limite: string; bloquearPorcentaje?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-5">
      <label className={etiqueta}>
        Nombre
        <input name="nombre" defaultValue={p.nombre} required maxLength={40} className={campo} />
      </label>
      <label className={etiqueta}>
        Porcentaje
        <input
          name="porcentaje"
          type="number"
          step="0.01"
          min="0.01"
          max="100"
          defaultValue={p.porcentaje}
          required
          readOnly={p.bloquearPorcentaje}
          title={p.bloquearPorcentaje ? "Hay periodos cerrados: el porcentaje ya no se puede cambiar" : undefined}
          className={`${campo} ${p.bloquearPorcentaje ? "bg-slate-50 text-muted" : ""}`}
        />
      </label>
      <label className={etiqueta}>
        Inicio
        <input name="fechaInicio" type="date" defaultValue={p.inicio} required className={campo} />
      </label>
      <label className={etiqueta}>
        Fin
        <input name="fechaFin" type="date" defaultValue={p.fin} required className={campo} />
      </label>
      <label className={etiqueta}>
        Plazo de notas
        <input name="fechaLimiteNotas" type="date" defaultValue={p.limite} className={campo} />
      </label>
    </div>
  );
}

function FilaPeriodo({ periodo: p, bloquearPorcentaje, esUltimo }: { periodo: PeriodoAdmin; bloquearPorcentaje: boolean; esUltimo: boolean }) {
  const [editando, setEditando] = useState(false);
  return (
    <>
      <tr className="border-t border-line">
        <td className="px-4 py-1.5">
          <span className="flex items-center gap-1.5 font-medium">
            {p.cerrado && <IconLock className="size-3 text-muted" aria-label="Cerrado" />}
            {p.nombre}
          </span>
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">{p.porcentaje} %</td>
        <td className="px-2 py-1.5 whitespace-nowrap text-ink-soft">
          {fechaCorta(p.fechaInicio)} – {fechaCorta(p.fechaFin, true)}
        </td>
        <td className="px-2 py-1.5 whitespace-nowrap text-ink-soft">{p.fechaLimiteNotas ? fechaCorta(p.fechaLimiteNotas, true) : "—"}</td>
        <td className="px-4 py-1.5 text-right whitespace-nowrap">
          {p.cerrado ? (
            <span className="text-xs text-muted">Cerrado</span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <button type="button" onClick={() => setEditando(!editando)} aria-expanded={editando} className={btnTexto}>
                {editando ? "Cerrar" : "Editar"}
              </button>
              {esUltimo && (
                <BotonConfirmado
                  accion={eliminarPeriodo}
                  campos={{ id: p.id }}
                  texto="Eliminar"
                  pregunta={`¿Eliminar ${p.nombre}?`}
                  confirmar="Eliminar"
                  peligro
                  disabled={p.calificaciones > 0}
                  title={p.calificaciones > 0 ? "Tiene calificaciones: no se puede eliminar" : undefined}
                />
              )}
            </span>
          )}
        </td>
      </tr>
      {editando && (
        <tr className="bg-canvas">
          <td colSpan={5} className="px-4 py-3">
            <FormAccion accion={editarPeriodo} boton="Guardar cambios" limpiarAlGuardar={false}>
              <input type="hidden" name="id" value={p.id} />
              <CamposPeriodo
                nombre={p.nombre}
                porcentaje={String(p.porcentaje)}
                inicio={p.fechaInicio}
                fin={p.fechaFin}
                limite={p.fechaLimiteNotas ?? ""}
                bloquearPorcentaje={bloquearPorcentaje}
              />
            </FormAccion>
          </td>
        </tr>
      )}
    </>
  );
}
