"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EstadoAsistencia } from "@/db/schema";
import { eliminarClase, guardarAsistencia } from "../actions";
import type { FilaLista } from "../server";

export const ESTADOS: { id: EstadoAsistencia; corto: string; texto: string; activo: string }[] = [
  { id: "PRESENTE", corto: "P", texto: "Presente", activo: "border-ok bg-ok text-white" },
  { id: "AUSENTE", corto: "A", texto: "Ausente", activo: "border-bad bg-bad text-white" },
  { id: "TARDE", corto: "T", texto: "Tarde", activo: "border-warn bg-warn text-white" },
  { id: "EXCUSA", corto: "E", texto: "Excusa", activo: "border-brand bg-brand text-white" },
];

type Registro = { estado: EstadoAsistencia; observacion: string };

export function ListaClase({
  assignmentId,
  fecha,
  filas,
  horasIniciales,
  temaInicial,
  sesionId,
  editable,
  intensidadHoraria,
}: {
  assignmentId: string;
  fecha: string;
  filas: FilaLista[];
  horasIniciales: number;
  temaInicial: string;
  sesionId: string | null;
  editable: boolean;
  intensidadHoraria: number;
}) {
  const router = useRouter();
  const inicial = useMemo(() => Object.fromEntries(filas.map((f) => [f.enrollmentId, { estado: f.estado, observacion: f.observacion }])), [filas]);
  const [reg, setReg] = useState<Record<string, Registro>>(inicial);
  const [horas, setHoras] = useState(horasIniciales);
  const [tema, setTema] = useState(temaInicial);
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [cambios, setCambios] = useState(false);
  const [pendiente, iniciar] = useTransition();

  const marcar = (id: string, estado: EstadoAsistencia) => {
    if (!editable) return;
    setReg((r) => ({ ...r, [id]: { ...r[id], estado } }));
    setCambios(true);
    setResultado(null);
  };
  const conteo = Object.values(reg).reduce<Record<EstadoAsistencia, number>>(
    (c, r) => ({ ...c, [r.estado]: c[r.estado] + 1 }),
    { PRESENTE: 0, AUSENTE: 0, TARDE: 0, EXCUSA: 0 },
  );

  const guardar = () =>
    iniciar(async () => {
      const r = await guardarAsistencia({
        assignmentId,
        fecha,
        horas,
        tema: tema.trim() || null,
        registros: filas.map((f) => ({ enrollmentId: f.enrollmentId, ...reg[f.enrollmentId] })),
      });
      setResultado(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error });
      if (r.ok) setCambios(false);
    });

  const borrar = () => {
    if (!sesionId || !window.confirm("¿Eliminar esta clase y su lista? Las fallas de la planilla se recalculan.")) return;
    iniciar(async () => {
      const r = await eliminarClase(sesionId);
      setResultado(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error });
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {editable && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4 shadow-tarjeta">
          <label className="text-xs font-medium text-ink-soft">
            Horas de clase
            <select
              value={horas}
              onChange={(e) => {
                setHoras(Number(e.target.value));
                setCambios(true);
              }}
              className="mt-1 block h-9 rounded-lg border border-line bg-surface px-2 text-[13px]"
            >
              {[1, 2, 3, 4].map((h) => (
                <option key={h} value={h}>
                  {h} {h === 1 ? "hora" : "horas"}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-48 flex-1 text-xs font-medium text-ink-soft">
            Tema de la clase (opcional)
            <input
              value={tema}
              onChange={(e) => {
                setTema(e.target.value);
                setCambios(true);
              }}
              maxLength={200}
              placeholder="Ej.: Ecuaciones de primer grado"
              className="mt-1 block h-9 w-full rounded-lg border border-line bg-surface px-3 text-[13px] outline-none focus-visible:border-cielo focus-visible:ring-2 focus-visible:ring-cielo/20"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setReg(Object.fromEntries(filas.map((f) => [f.enrollmentId, { estado: "PRESENTE" as const, observacion: reg[f.enrollmentId].observacion }])));
              setCambios(true);
            }}
            className="btn-kora h-9 rounded-lg border border-ok-line bg-ok-soft px-3 text-xs font-semibold text-ok hover:border-ok"
          >
            ✓ Todos presentes
          </button>
          <p className="w-full text-[11px] text-muted">Intensidad semanal de la asignatura: {intensidadHoraria} h. Las horas de esta clase suman a las fallas de quienes falten.</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs" aria-live="polite">
        {ESTADOS.map((e) => (
          <span key={e.id} className="rounded-full border border-line bg-surface px-3 py-1 font-semibold text-ink-soft">
            {e.texto}: <span className="font-display text-sm text-ink">{conteo[e.id]}</span>
          </span>
        ))}
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-tarjeta">
        {filas.map((f, i) => {
          const r = reg[f.enrollmentId];
          return (
            <li key={f.enrollmentId} className={`px-4 py-2.5 transition-colors ${r.estado === "AUSENTE" ? "bg-bad-soft/50" : r.estado === "TARDE" ? "bg-warn-soft/50" : ""}`}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-6 text-right text-xs text-muted tabular-nums">{i + 1}</span>
                <div className="min-w-40 flex-1">
                  <p className="font-medium text-ink">{f.nombre}</p>
                  <p className="text-[11px] text-muted">
                    {f.fallasPeriodo > 0 ? <span className={f.fallasPeriodo >= 10 ? "font-semibold text-bad" : "text-warn"}>{f.fallasPeriodo} h de falla en el periodo</span> : "Sin fallas en el periodo"}
                  </p>
                </div>
                <div role="radiogroup" aria-label={`Asistencia de ${f.nombre}`} className="flex gap-1">
                  {ESTADOS.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      role="radio"
                      aria-checked={r.estado === e.id}
                      title={e.texto}
                      disabled={!editable}
                      onClick={() => marcar(f.enrollmentId, e.id)}
                      className={`btn-kora grid size-9 place-items-center rounded-lg border text-xs font-bold disabled:cursor-default ${
                        r.estado === e.id ? `${e.activo} shadow-sm` : "border-line text-muted hover:border-line-strong hover:text-ink"
                      }`}
                    >
                      {e.corto}
                      <span className="sr-only">{e.texto}</span>
                    </button>
                  ))}
                </div>
                {editable && (
                  <button
                    type="button"
                    onClick={() => setAbiertas((a) => ({ ...a, [f.enrollmentId]: !a[f.enrollmentId] }))}
                    className="text-xs text-muted hover:text-brand"
                  >
                    {r.observacion ? "Nota ✎" : "+ Nota"}
                  </button>
                )}
              </div>
              {(abiertas[f.enrollmentId] || (!editable && r.observacion)) && (
                <input
                  value={r.observacion}
                  readOnly={!editable}
                  onChange={(e) => {
                    setReg((m) => ({ ...m, [f.enrollmentId]: { ...m[f.enrollmentId], observacion: e.target.value } }));
                    setCambios(true);
                  }}
                  maxLength={300}
                  placeholder="Ej.: llegó 15 minutos tarde; excusa médica entregada"
                  className="mt-2 ml-9 block h-8 w-[calc(100%-2.25rem)] rounded-lg border border-line bg-surface px-2.5 text-[13px] outline-none focus-visible:border-cielo"
                />
              )}
            </li>
          );
        })}
      </ul>

      {editable && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface/95 px-4 py-3 shadow-elevada">
          <button
            type="button"
            onClick={guardar}
            disabled={pendiente}
            className="btn-kora h-10 rounded-xl bg-gradient-to-r from-petroleo to-brand px-5 font-semibold text-white shadow-[0_8px_20px_-10px_rgb(26_79_208/0.8)] disabled:opacity-60"
          >
            {pendiente ? "Guardando…" : sesionId ? "Actualizar lista" : "Guardar lista"}
          </button>
          {cambios && !pendiente && <span className="text-xs font-semibold text-warn">Cambios sin guardar</span>}
          {resultado && (
            <span className={`anim-pop text-sm font-semibold ${resultado.ok ? "text-ok" : "text-bad"}`}>
              {resultado.ok ? "✓ " : ""}
              {resultado.texto}
            </span>
          )}
          {sesionId && (
            <button type="button" onClick={borrar} disabled={pendiente} className="ml-auto text-xs text-muted hover:text-bad">
              Eliminar esta clase
            </button>
          )}
        </div>
      )}
    </div>
  );
}
