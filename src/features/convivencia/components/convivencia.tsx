"use client";

import { startTransition, useActionState, useState } from "react";
import { IconCheck } from "@/components/icons";
import { fechaCorta, hoyISO } from "@/lib/fechas";
import { fechaHora, SITUACION, TIPO_ANOTACION } from "@/features/portal/formato";
import { cerrarProceso, crearAnotacion } from "../actions";
import { estadoConvivenciaInicial, SITUACIONES, TIPOS_ANOTACION, type AnotacionConvivencia, type EstadoConvivencia } from "../types";

const campo =
  "mt-1 block w-full rounded-sm border border-line-strong bg-surface px-2 py-1.5 outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20";
const etiqueta = "block text-xs font-medium text-ink-soft";
const btnPrimario = "h-8 rounded-sm bg-brand px-3 font-medium text-white hover:bg-brand-hover disabled:opacity-50";

const ROL_AUTOR: Record<string, string> = {
  RECTOR: "Rectoría",
  COORDINATOR: "Coordinación",
  ADMIN: "Administración",
  TEACHER: "Docente",
};

function Resultado({ estado }: { estado: EstadoConvivencia }) {
  if (estado.error) {
    return (
      <p role="alert" className="text-xs text-bad">
        {estado.error}
      </p>
    );
  }
  if (estado.ok && estado.mensaje) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-xs text-ok">
        <IconCheck className="size-3.5" /> {estado.mensaje}
      </p>
    );
  }
  return null;
}

export function NuevaAnotacion({ studentId, estudiante, puedeAbrirProceso }: { studentId: string; estudiante: string; puedeAbrirProceso: boolean }) {
  const [estado, enviar, pendiente] = useActionState(crearAnotacion, estadoConvivenciaInicial);
  const [tipo, setTipo] = useState<(typeof TIPOS_ANOTACION)[number]>("DISCIPLINARIA");
  const [situacion, setSituacion] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [accion, setAccion] = useState("");
  const [proceso, setProceso] = useState(false);
  const [fecha, setFecha] = useState(hoyISO());
  const [previo, setPrevio] = useState(estado);
  if (previo !== estado) {
    setPrevio(estado);
    if (estado.ok) {
      setDescripcion("");
      setAccion("");
      setSituacion("");
      setProceso(false);
    }
  }
  const aplicaSituacion = tipo === "DISCIPLINARIA" || tipo === "CONVIVENCIA";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => enviar(datos));
      }}
      className="space-y-3 rounded-sm border border-line bg-surface p-4"
    >
      <h3 className="font-semibold tracking-tight">Nueva anotación · {estudiante}</h3>
      <input type="hidden" name="studentId" value={studentId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={etiqueta}>
          Tipo
          <select
            name="tipo"
            value={tipo}
            onChange={(e) => {
              const t = e.target.value as (typeof TIPOS_ANOTACION)[number];
              setTipo(t);
              if (t !== "DISCIPLINARIA" && t !== "CONVIVENCIA") {
                setSituacion("");
                setProceso(false);
              }
            }}
            className={campo}
          >
            {TIPOS_ANOTACION.map((t) => (
              <option key={t} value={t}>
                {TIPO_ANOTACION[t]}
              </option>
            ))}
          </select>
        </label>
        <label className={etiqueta}>
          Situación (Ley 1620)
          <select name="situacion" value={situacion} onChange={(e) => setSituacion(e.target.value)} disabled={!aplicaSituacion} className={campo}>
            <option value="">No aplica</option>
            {SITUACIONES.map((s) => (
              <option key={s} value={s}>
                {SITUACION[s]}
              </option>
            ))}
          </select>
        </label>
        <label className={etiqueta}>
          Fecha de los hechos
          <input type="date" name="fecha" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} required className={campo} />
        </label>
      </div>
      <label className={etiqueta}>
        Descripción de los hechos
        <textarea name="descripcion" rows={3} maxLength={4000} required value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className={campo} />
      </label>
      <label className={etiqueta}>
        Acción pedagógica o compromiso (opcional)
        <textarea name="accionPedagogica" rows={2} maxLength={2000} value={accion} onChange={(e) => setAccion(e.target.value)} className={campo} />
      </label>
      {puedeAbrirProceso && aplicaSituacion && (
        <label className="flex items-start gap-2 rounded-sm border border-warn-line bg-warn-soft px-3 py-2 text-xs text-warn">
          <input type="checkbox" name="abrirProceso" checked={proceso} onChange={(e) => setProceso(e.target.checked)} className="mt-0.5" />
          <span>
            <strong>Abrir proceso disciplinario.</strong> Queda abierto hasta que coordinación lo cierre con una conclusión; el estudiante
            puede presentar descargos y el acudiente firmar desde el portal.
          </span>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pendiente || descripcion.trim().length < 10} className={btnPrimario}>
          {pendiente ? "Guardando…" : proceso ? "Registrar y abrir proceso" : "Registrar anotación"}
        </button>
        <span className="text-xs text-muted">Las anotaciones no se editan ni se borran: quedan como registro.</span>
      </div>
      <Resultado estado={estado} />
    </form>
  );
}

export function ListaAnotaciones({ anotaciones, puedeCerrar }: { anotaciones: AnotacionConvivencia[]; puedeCerrar: boolean }) {
  if (anotaciones.length === 0) return <p className="rounded-sm border border-line bg-surface px-4 py-3 text-muted">Sin anotaciones este año.</p>;
  return (
    <ol className="space-y-3">
      {anotaciones.map((a) => (
        <li key={a.id} className={`rounded-sm border bg-surface ${a.proceso === "ABIERTO" ? "border-warn-line" : "border-line"}`}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-xs">
            <span className="font-medium text-ink">{TIPO_ANOTACION[a.tipo]}</span>
            {a.situacion && <span className="rounded-sm border border-line-strong px-1.5">{SITUACION[a.situacion]}</span>}
            {a.proceso === "ABIERTO" && <span className="rounded-sm border border-warn-line bg-warn-soft px-1.5 font-medium text-warn">Proceso abierto</span>}
            {a.proceso === "CERRADO" && <span className="rounded-sm border border-ok-line bg-ok-soft px-1.5 font-medium text-ok">Proceso cerrado</span>}
            <span className="ml-auto text-muted">
              {fechaCorta(a.fecha, true)} · {a.autor} ({ROL_AUTOR[a.autorRol] ?? a.autorRol})
            </span>
          </div>
          <div className="space-y-2 px-4 py-3">
            <p>{a.descripcion}</p>
            {a.accionPedagogica && (
              <p className="text-ink-soft">
                <span className="text-xs font-medium text-muted">Acción pedagógica: </span>
                {a.accionPedagogica}
              </p>
            )}
            {a.descargos && (
              <p className="border-l-2 border-line-strong pl-3 text-ink-soft">
                <span className="text-xs font-medium text-muted">Descargos del estudiante: </span>
                {a.descargos}
              </p>
            )}
            <p className="text-xs text-muted">
              {a.firmadaPor ? `Firmada por el acudiente ${a.firmadaPor} el ${fechaHora(a.firmadaAt!)}` : "Pendiente de firma del acudiente"}
            </p>
            {a.proceso === "CERRADO" && a.conclusion && (
              <p className="rounded-sm bg-canvas px-3 py-2 text-ink-soft">
                <span className="text-xs font-medium text-muted">
                  Conclusión ({a.cerradoPor}, {a.cerradoAt && fechaHora(a.cerradoAt)}):{" "}
                </span>
                {a.conclusion}
              </p>
            )}
            {a.proceso === "ABIERTO" && puedeCerrar && <CerrarProceso id={a.id} />}
          </div>
        </li>
      ))}
    </ol>
  );
}

function CerrarProceso({ id }: { id: string }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(cerrarProceso, estadoConvivenciaInicial);
  const [texto, setTexto] = useState("");
  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="text-xs font-medium text-brand hover:underline">
        Cerrar proceso…
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => enviar(datos));
      }}
      className="space-y-2 rounded-sm border border-line bg-canvas p-3"
    >
      <input type="hidden" name="id" value={id} />
      <label className={etiqueta}>
        Conclusión y medidas adoptadas
        <textarea name="conclusion" rows={2} maxLength={2000} value={texto} onChange={(e) => setTexto(e.target.value)} className={campo} />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pendiente || texto.trim().length < 10} className={btnPrimario}>
          {pendiente ? "Cerrando…" : "Cerrar proceso"}
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="h-8 px-2 text-xs font-medium text-muted hover:text-ink">
          Cancelar
        </button>
      </div>
      <Resultado estado={estado} />
    </form>
  );
}
