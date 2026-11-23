"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { IconCheck, IconLock } from "@/components/icons";
import { diasEntre, fechaCorta, porcentajeAvance, relativoDias } from "@/lib/fechas";
import { fechaHora } from "@/features/portal/formato";
import { actualizarFechas, cerrarPeriodo, reabrirPeriodo } from "../actions";
import { estadoInicial, type EstadoAccion, type PeriodoGestion } from "../types";
import { BarraAvance } from "./barra-avance";

type Panel = "cerrar" | "reabrir" | "fechas" | null;

export function PeriodoTarjeta({
  periodo: p,
  anteriorAbierto,
  hoy,
}: {
  periodo: PeriodoGestion;
  /** Nombre del primer periodo anterior que sigue abierto (impide cerrar este). */
  anteriorAbierto: string | null;
  hoy: string;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const enCurso = p.fechaInicio <= hoy && hoy <= p.fechaFin;
  const futuro = hoy < p.fechaInicio;
  const pct = porcentajeAvance(p.avance.conNota, p.avance.celdas);
  const diasPlazo = p.fechaLimiteNotas ? diasEntre(hoy, p.fechaLimiteNotas) : null;

  return (
    <section aria-labelledby={`periodo-${p.id}`} className="rounded-sm border border-line bg-surface">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3 p-4">
        <div className="min-w-48 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`periodo-${p.id}`} className="font-semibold tracking-tight">
              {p.nombre}
            </h2>
            <span className="text-muted">· {p.porcentaje} % del año</span>
            <EstadoPeriodo cerrado={p.cerrado} enCurso={enCurso} futuro={futuro} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {fechaCorta(p.fechaInicio)} – {fechaCorta(p.fechaFin, true)}
            {p.fechaLimiteNotas && (
              <>
                {" · "}
                <span className={!p.cerrado && diasPlazo !== null && diasPlazo < 0 ? "font-medium text-bad" : undefined}>
                  Plazo de notas: {fechaCorta(p.fechaLimiteNotas)}
                  {!p.cerrado && diasPlazo !== null && ` (${diasPlazo < 0 ? "venció " : ""}${relativoDias(diasPlazo)})`}
                </span>
              </>
            )}
          </p>
          {p.cerrado && p.cerradoAt && (
            <p className="mt-1 text-xs text-muted">
              Cerrado el {fechaHora(p.cerradoAt)}
              {p.cerradoPor && ` por ${p.cerradoPor}`}
            </p>
          )}
        </div>

        <div className="w-56 shrink-0">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted">Digitación</span>
            <span className="font-medium tabular-nums">{pct} %</span>
          </div>
          <BarraAvance hecho={p.avance.conNota} total={p.avance.celdas} className="mt-1" />
          <p className="mt-1 text-xs text-muted tabular-nums">
            {p.avance.pendientes > 0 ? (
              <>
                <Link href={`/coordinacion/seguimiento?periodo=${p.id}`} className="font-medium text-warn hover:underline">
                  {p.avance.pendientes.toLocaleString("es-CO")} pendientes
                </Link>{" "}
                de {p.avance.celdas.toLocaleString("es-CO")}
              </>
            ) : (
              `${p.avance.celdas.toLocaleString("es-CO")} calificaciones completas`
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:w-72 sm:justify-end">
          {p.cerrado ? (
            <>
              {/* Cerrar bloquea la edición, no la consulta: coordinación sigue viendo todas las notas. */}
              <Link
                href={`/coordinacion/notas?periodo=${p.id}`}
                className="btn-kora flex h-8 items-center rounded-lg bg-gradient-to-r from-petroleo to-brand px-3 text-xs font-semibold text-white shadow-[0_6px_16px_-8px_rgb(26_79_208/0.8)]"
              >
                Ver notas
              </Link>
              <Boton activo={panel === "reabrir"} onClick={() => setPanel(panel === "reabrir" ? null : "reabrir")}>
                Reabrir…
              </Boton>
            </>
          ) : (
            <>
              <Boton activo={panel === "fechas"} onClick={() => setPanel(panel === "fechas" ? null : "fechas")}>
                Fechas…
              </Boton>
              <Boton primario activo={panel === "cerrar"} onClick={() => setPanel(panel === "cerrar" ? null : "cerrar")}>
                Cerrar periodo…
              </Boton>
            </>
          )}
        </div>
      </div>

      {panel === "cerrar" && <CerrarForm periodo={p} anteriorAbierto={anteriorAbierto} onCancelar={() => setPanel(null)} />}
      {panel === "reabrir" && <ReabrirForm periodo={p} onCancelar={() => setPanel(null)} />}
      {panel === "fechas" && <FechasForm periodo={p} onCancelar={() => setPanel(null)} />}

      {p.historial.length > 0 && (
        <details className="border-t border-line px-4 py-2 text-xs">
          <summary className="cursor-pointer text-muted hover:text-ink">Historial ({p.historial.length})</summary>
          <ol className="mt-2 space-y-1.5 pb-1">
            {p.historial.map((e, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="text-muted tabular-nums">{fechaHora(e.fecha)}</span>
                <span className="font-medium">{e.accion === "CIERRE" ? "Cerrado" : "Reabierto"}</span>
                <span className="text-ink-soft">por {e.actor}</span>
                {e.accion === "CIERRE" && e.pendientes > 0 && <span className="text-warn">· con {e.pendientes} pendientes</span>}
                {e.motivo && <span className="w-full text-ink-soft">«{e.motivo}»</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function EstadoPeriodo({ cerrado, enCurso, futuro }: { cerrado: boolean; enCurso: boolean; futuro: boolean }) {
  const [texto, clase] = cerrado
    ? ["Cerrado · publicado", "border-line-strong bg-slate-50 text-ink-soft"]
    : enCurso
      ? ["Abierto · en curso", "border-ok-line bg-ok-soft text-ok"]
      : futuro
        ? ["Abierto · próximo", "border-line bg-surface text-muted"]
        : ["Abierto · terminó", "border-warn-line bg-warn-soft text-warn"];
  return (
    <span className={`inline-flex h-5 items-center gap-1 rounded-sm border px-1.5 text-[11px] font-medium ${clase}`}>
      {cerrado && <IconLock className="size-3" />}
      {texto}
    </span>
  );
}

function Boton({
  children,
  onClick,
  activo,
  primario,
}: {
  children: React.ReactNode;
  onClick: () => void;
  activo: boolean;
  primario?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={activo}
      className={`h-8 rounded-sm px-3 font-medium ${
        primario
          ? "bg-brand text-white hover:bg-brand-hover"
          : `border border-line-strong text-ink-soft hover:bg-slate-50 ${activo ? "bg-slate-50" : "bg-surface"}`
      }`}
    >
      {children}
    </button>
  );
}

function Resultado({ estado }: { estado: EstadoAccion }) {
  if (estado.error) {
    return (
      <p role="alert" className="text-bad">
        {estado.error}
      </p>
    );
  }
  if (estado.ok && estado.mensaje) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-ok">
        <IconCheck /> {estado.mensaje}
      </p>
    );
  }
  return null;
}

function Hecho({ estado, onCerrar }: { estado: EstadoAccion; onCerrar: () => void }) {
  return (
    <div className={`${panelClase} flex flex-wrap items-center justify-between gap-2 space-y-0`}>
      <Resultado estado={estado} />
      <button type="button" onClick={onCerrar} className={btnTexto}>
        Listo
      </button>
    </div>
  );
}

const panelClase ="space-y-3 border-t border-line bg-canvas px-4 py-3";
const btnPrimario = "h-8 rounded-sm bg-brand px-3 font-medium text-white hover:bg-brand-hover disabled:opacity-50";
const btnPeligro = "h-8 rounded-sm bg-bad px-3 font-medium text-white hover:bg-red-800 disabled:opacity-50";
const btnTexto = "h-8 px-3 font-medium text-muted hover:text-ink";

function CerrarForm({ periodo: p, anteriorAbierto, onCancelar }: { periodo: PeriodoGestion; anteriorAbierto: string | null; onCancelar: () => void }) {
  const [estado, accion, pendiente] = useActionState(cerrarPeriodo, estadoInicial);
  const [confirmado, setConfirmado] = useState(false);
  const faltan = p.avance.pendientes;

  if (estado.ok) return <Hecho estado={estado} onCerrar={onCancelar} />;
  if (anteriorAbierto) {
    return (
      <div className={panelClase}>
        <p>
          Para cerrar {p.nombre.toLowerCase()} primero debe cerrar <strong>{anteriorAbierto}</strong>: los periodos se cierran en orden
          para que el acumulado del boletín no quede incompleto.
        </p>
        <button type="button" onClick={onCancelar} className={btnTexto}>
          Entendido
        </button>
      </div>
    );
  }

  return (
    <form action={accion} className={panelClase}>
      <input type="hidden" name="periodId" value={p.id} />
      <input type="hidden" name="pendientesVistos" value={faltan} />
      <p>
        Al cerrar {p.nombre.toLowerCase()}, los docentes ya no podrán modificar sus planillas y el boletín quedará{" "}
        <strong>publicado</strong> para estudiantes y acudientes.
      </p>
      {faltan > 0 ? (
        <label className="flex items-start gap-2 rounded-sm border border-warn-line bg-warn-soft px-3 py-2 text-warn">
          <input
            type="checkbox"
            name="confirmarPendientes"
            checked={confirmado}
            onChange={(e) => setConfirmado(e.target.checked)}
            className="mt-0.5 accent-current"
          />
          <span>
            Faltan <strong>{faltan.toLocaleString("es-CO")} calificaciones</strong> por digitar. Entiendo que esos estudiantes verán la
            asignatura sin nota en el boletín.{" "}
            <Link href={`/coordinacion/seguimiento?periodo=${p.id}`} className="font-medium underline">
              Ver quién falta
            </Link>
          </span>
        </label>
      ) : (
        <p className="flex items-center gap-1.5 text-ok">
          <IconCheck /> Todas las calificaciones están digitadas.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pendiente || (faltan > 0 && !confirmado)} className={btnPrimario}>
          {pendiente ? "Cerrando…" : `Cerrar y publicar ${p.nombre.toLowerCase()}`}
        </button>
        <button type="button" onClick={onCancelar} className={btnTexto}>
          Cancelar
        </button>
      </div>
      <Resultado estado={estado} />
    </form>
  );
}

function ReabrirForm({ periodo: p, onCancelar }: { periodo: PeriodoGestion; onCancelar: () => void }) {
  const [estado, accion, pendiente] = useActionState(reabrirPeriodo, estadoInicial);
  const [motivo, setMotivo] = useState("");
  if (estado.ok) return <Hecho estado={estado} onCerrar={onCancelar} />;
  return (
    <form action={accion} className={panelClase}>
      <input type="hidden" name="periodId" value={p.id} />
      <p>
        Reabrir {p.nombre.toLowerCase()} permite a los docentes corregir calificaciones y <strong>retira su boletín del portal</strong>{" "}
        hasta que se vuelva a cerrar. Úselo solo para correcciones; el motivo queda en el historial.
      </p>
      <div>
        <label htmlFor={`motivo-${p.id}`} className="block text-xs font-medium text-ink-soft">
          Motivo de la reapertura
        </label>
        <textarea
          id={`motivo-${p.id}`}
          name="motivo"
          rows={2}
          maxLength={500}
          required
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Ej.: Corrección de la nota de Matemáticas de 6-01 aprobada por el Consejo Académico (acta 12)."
          className="mt-1 block w-full max-w-2xl rounded-sm border border-line-strong bg-surface px-2.5 py-2 outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pendiente || motivo.trim().length < 10} className={btnPeligro}>
          {pendiente ? "Reabriendo…" : `Reabrir ${p.nombre.toLowerCase()}`}
        </button>
        <button type="button" onClick={onCancelar} className={btnTexto}>
          Cancelar
        </button>
      </div>
      <Resultado estado={estado} />
    </form>
  );
}

function FechasForm({ periodo: p, onCancelar }: { periodo: PeriodoGestion; onCancelar: () => void }) {
  const [estado, accion, pendiente] = useActionState(actualizarFechas, estadoInicial);
  // Controlados: React reinicia el formulario tras la acción y, si hubo error, se perdería lo digitado.
  const [inicio, setInicio] = useState(p.fechaInicio);
  const [fin, setFin] = useState(p.fechaFin);
  const [limite, setLimite] = useState(p.fechaLimiteNotas ?? "");
  const campo = "mt-1 block h-8 rounded-sm border border-line-strong bg-surface px-2 outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20";
  return (
    <form action={accion} className={panelClase}>
      <input type="hidden" name="periodId" value={p.id} />
      <div className="flex flex-wrap gap-4">
        <label className="text-xs font-medium text-ink-soft">
          Inicio
          <input type="date" name="fechaInicio" value={inicio} onChange={(e) => setInicio(e.target.value)} required className={campo} />
        </label>
        <label className="text-xs font-medium text-ink-soft">
          Fin
          <input type="date" name="fechaFin" value={fin} onChange={(e) => setFin(e.target.value)} required className={campo} />
        </label>
        <label className="text-xs font-medium text-ink-soft">
          Plazo para entregar notas
          <input type="date" name="fechaLimiteNotas" value={limite} onChange={(e) => setLimite(e.target.value)} className={campo} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pendiente} className={btnPrimario}>
          {pendiente ? "Guardando…" : "Guardar fechas"}
        </button>
        <button type="button" onClick={onCancelar} className={btnTexto}>
          Cerrar
        </button>
      </div>
      <Resultado estado={estado} />
    </form>
  );
}
