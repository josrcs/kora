"use client";

import { memo, startTransition as iniciarTransicion, useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconAlert, IconLock } from "@/components/icons";
import { calcularDefinitiva, desempenoDe, formatNota, parseFallas, parseNota, reprueba, type Escala, type ParseResult } from "@/lib/grading/calc";
import { crearActividad, editarActividad, eliminarActividad } from "@/app/(app)/docente/planilla/actions";
import type { ActividadPlanilla, Cambio, EstadoActividad, FilaPlanilla, OpcionAsignacion, OpcionPeriodo, PlanillaData } from "../types";
import { DesempenoBadge } from "@/components/desempeno-badge";
import { SaveStatus } from "./save-status";
import { useAutosave } from "./use-autosave";
import { ObservadorDialogo } from "./observador-dialogo";

/* ------------------------------------------------------------------ */
/*  Modelo de la grilla                                                */
/* ------------------------------------------------------------------ */
type Columna =
  | { key: string; tipo: "actividad"; actividad: ActividadPlanilla }
  | { key: "nota"; tipo: "nota" }
  | { key: "fallas"; tipo: "fallas" }
  | { key: "recuperacion"; tipo: "recuperacion" };

type Valores = { notas: Record<string, number | null>; nota: number | null; recuperacion: number | null; fallas: number; observacion: string };
type PorCelda = Record<string, Record<string, string>>;
const VACIO: Record<string, string> = Object.freeze({}) as Record<string, string>;

const conValor = (m: PorCelda, fila: string, col: string, valor: string): PorCelda =>
  m[fila]?.[col] === valor ? m : { ...m, [fila]: { ...m[fila], [col]: valor } };
function sinValor(m: PorCelda, fila: string, col: string): PorCelda {
  if (!m[fila] || !(col in m[fila])) return m;
  const resto = { ...m[fila] };
  delete resto[col];
  return { ...m, [fila]: resto };
}

function leer(v: Valores, col: Columna): number | null {
  switch (col.tipo) {
    case "actividad":
      return v.notas[col.key] ?? null;
    case "nota":
      return v.nota;
    case "fallas":
      return v.fallas;
    case "recuperacion":
      return v.recuperacion;
  }
}
function escribir(v: Valores, col: Columna, valor: number | null): Valores {
  switch (col.tipo) {
    case "actividad":
      return { ...v, notas: { ...v.notas, [col.key]: valor } };
    case "nota":
      return { ...v, nota: valor };
    case "fallas":
      return { ...v, fallas: valor ?? 0 };
    case "recuperacion":
      return { ...v, recuperacion: valor };
  }
}
function aCambio(enrollmentId: string, col: Columna, valor: number | null): Cambio {
  switch (col.tipo) {
    case "actividad":
      return { campo: "actividad", enrollmentId, activityId: col.key, valor };
    case "nota":
      return { campo: "nota", enrollmentId, valor };
    case "fallas":
      return { campo: "fallas", enrollmentId, valor: valor ?? 0 };
    case "recuperacion":
      return { campo: "recuperacion", enrollmentId, valor };
  }
}
const textoDe = (v: Valores, col: Columna, decimales: 1 | 2) =>
  col.tipo === "fallas" ? (v.fallas ? String(v.fallas) : "") : formatNota(leer(v, col), decimales).replace(".", ",");

function parsear(col: Columna, raw: string, escala: Escala, tope: number): ParseResult {
  if (col.tipo === "fallas") return parseFallas(raw);
  const r = parseNota(raw, escala);
  if (r.ok && col.tipo === "recuperacion" && r.value !== null && r.value > tope) {
    return { ok: false, error: `La recuperación no puede superar ${formatNota(tope, escala.decimales)}` };
  }
  return r;
}

/* ------------------------------------------------------------------ */
/*  Componente principal                                               */
/* ------------------------------------------------------------------ */
type Props = { data: PlanillaData; asignaciones: OpcionAsignacion[]; periodos: OpcionPeriodo[]; esCoordinacion: boolean };

export function PlanillaDocente({ data, asignaciones, periodos, esCoordinacion }: Props) {
  const router = useRouter();
  const [navegando, startTransition] = useTransition();
  const { escala, actividades, asignacion, periodo, topeRecuperacion } = data;
  const recuperando = data.modo === "recuperacion";
  const modoDirecto = actividades.length === 0;

  const [bloqueo, setBloqueo] = useState<string | null>(data.motivoBloqueo);
  const editable = data.modo !== "lectura" && bloqueo === null;

  // En recuperación solo aparecen quienes perdieron el periodo.
  const filas = useMemo(
    () => (recuperando ? data.filas.filter((f) => f.nota !== null && reprueba(f.nota, escala)) : data.filas),
    [data.filas, recuperando, escala],
  );

  const columnas = useMemo<Columna[]>(
    () =>
      recuperando
        ? [{ key: "recuperacion", tipo: "recuperacion" }]
        : [
            ...actividades.map((a) => ({ key: a.id, tipo: "actividad" as const, actividad: a })),
            ...(modoDirecto ? [{ key: "nota" as const, tipo: "nota" as const }] : []),
            { key: "fallas", tipo: "fallas" },
          ],
    [actividades, modoDirecto, recuperando],
  );

  const inicial = useMemo(
    () =>
      Object.fromEntries(
        data.filas.map((f) => [
          f.enrollmentId,
          { notas: { ...f.notas }, nota: f.nota, recuperacion: f.notaRecuperacion, fallas: f.fallas, observacion: f.observacion },
        ]),
      ) as Record<string, Valores>,
    [data.filas],
  );
  const store = useRef(inicial);
  const [valores, setValores] = useState(inicial);
  const [textos, setTextos] = useState<PorCelda>({});
  const [errores, setErrores] = useState<PorCelda>({});
  const [aviso, setAviso] = useState<string | null>(null);

  const onGuardado = useCallback(
    (definitivas: Record<string, number | null>) => {
      if (recuperando) return;
      let cambio = false;
      const next = { ...store.current };
      for (const [id, nota] of Object.entries(definitivas)) {
        if (next[id] && next[id].nota !== nota) {
          next[id] = { ...next[id], nota };
          cambio = true;
        }
      }
      if (cambio) {
        store.current = next;
        setValores(next);
      }
    },
    [recuperando],
  );

  const { estado, encolar, guardarAhora, hayPendientes } = useAutosave({
    assignmentId: asignacion.id,
    periodId: periodo.id,
    onGuardado,
    onBloqueo: setBloqueo,
  });

  const aplicar = useCallback(
    (enrollmentId: string, col: Columna, raw: string, normalizar: boolean): boolean => {
      const res = parsear(col, raw, escala, topeRecuperacion);
      if (!res.ok) {
        setTextos((m) => conValor(m, enrollmentId, col.key, raw));
        setErrores((m) => conValor(m, enrollmentId, col.key, res.error));
        return false;
      }
      setErrores((m) => sinValor(m, enrollmentId, col.key));
      setTextos((m) => (normalizar ? sinValor(m, enrollmentId, col.key) : conValor(m, enrollmentId, col.key, raw)));
      const actual = store.current[enrollmentId];
      if (leer(actual, col) === res.value) return true;
      store.current = { ...store.current, [enrollmentId]: escribir(actual, col, res.value) };
      setValores(store.current);
      encolar(`${enrollmentId}:${col.key}`, aCambio(enrollmentId, col, res.value));
      return true;
    },
    [escala, encolar, topeRecuperacion],
  );

  /** Observación del boletín (desde el diálogo del observador). */
  const guardarObservacion = useCallback(
    (enrollmentId: string, texto: string) => {
      const actual = store.current[enrollmentId];
      if (actual.observacion === texto) return;
      store.current = { ...store.current, [enrollmentId]: { ...actual, observacion: texto } };
      setValores(store.current);
      encolar(`${enrollmentId}:observacion`, { campo: "observacion", enrollmentId, valor: texto });
    },
    [encolar],
  );

  /* ---------------- teclado, foco y pegado (delegados en <tbody>) ---------------- */
  const gridRef = useRef<HTMLTableSectionElement>(null);
  const alEnfocar = useRef<{ fila: string; col: string; texto: string } | null>(null);
  const enfocar = useCallback((r: number, c: number) => {
    const el = gridRef.current?.querySelector<HTMLInputElement>(`input[data-r="${r}"][data-c="${c}"]`);
    if (el) {
      el.focus();
      el.select();
    }
  }, []);
  const celdaDe = (target: EventTarget) => {
    const el = target as HTMLInputElement;
    if (el.tagName !== "INPUT" || el.dataset.r === undefined) return null;
    const r = Number(el.dataset.r);
    const c = Number(el.dataset.c);
    return { el, r, c, fila: filas[r], col: columnas[c] };
  };
  const onChange = (e: React.ChangeEvent<HTMLTableSectionElement>) => {
    const celda = celdaDe(e.target);
    if (celda && editable) aplicar(celda.fila.enrollmentId, celda.col, celda.el.value, false);
  };
  const onFocus = (e: React.FocusEvent<HTMLTableSectionElement>) => {
    const celda = celdaDe(e.target);
    if (!celda) return;
    alEnfocar.current = { fila: celda.fila.enrollmentId, col: celda.col.key, texto: celda.el.value };
    celda.el.select();
  };
  const onBlur = (e: React.FocusEvent<HTMLTableSectionElement>) => {
    const celda = celdaDe(e.target);
    if (celda && editable) aplicar(celda.fila.enrollmentId, celda.col, celda.el.value, true);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLTableSectionElement>) => {
    const celda = celdaDe(e.target);
    if (!celda) return;
    const { el, r, c } = celda;
    const todo = el.selectionStart === 0 && el.selectionEnd === el.value.length;
    switch (e.key) {
      case "Enter":
        e.preventDefault();
        enfocar(r + (e.shiftKey ? -1 : 1), c);
        break;
      case "ArrowDown":
        e.preventDefault();
        enfocar(r + 1, c);
        break;
      case "ArrowUp":
        e.preventDefault();
        enfocar(r - 1, c);
        break;
      case "ArrowLeft":
        if (todo || (el.selectionStart === 0 && el.selectionEnd === 0)) {
          e.preventDefault();
          enfocar(r, c - 1);
        }
        break;
      case "ArrowRight":
        if (todo || (el.selectionStart === el.value.length && el.selectionEnd === el.value.length)) {
          e.preventDefault();
          enfocar(r, c + 1);
        }
        break;
      case "Escape": {
        const previo = alEnfocar.current;
        if (editable && previo && previo.fila === celda.fila.enrollmentId && previo.col === celda.col.key) {
          e.preventDefault();
          aplicar(previo.fila, celda.col, previo.texto, true);
          requestAnimationFrame(() => el.select());
        }
        break;
      }
    }
  };
  /** Pegar un rango copiado de Excel/Sheets: llena hacia abajo y a la derecha desde la celda actual. */
  const onPaste = (e: React.ClipboardEvent<HTMLTableSectionElement>) => {
    const celda = celdaDe(e.target);
    if (!celda || !editable) return;
    const texto = e.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(texto.trim())) return;
    e.preventDefault();
    const matriz = texto.replace(/\r/g, "").replace(/\n+$/, "").split("\n").map((l) => l.split("\t"));
    let pegados = 0;
    let conError = 0;
    matriz.forEach((fila, i) =>
      fila.forEach((valor, j) => {
        const f = filas[celda.r + i];
        const col = columnas[celda.c + j];
        if (!f || !col) return;
        if (aplicar(f.enrollmentId, col, valor.trim(), true)) pegados++;
        else conError++;
      }),
    );
    setAviso(`Se pegaron ${pegados} valor${pegados === 1 ? "" : "es"}${conError ? ` · ${conError} con error, marcados en rojo` : ""}`);
  };
  useEffect(() => {
    if (!aviso) return;
    const id = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(id);
  }, [aviso]);

  /* ---------------- navegación ---------------- */
  const celdasConError = Object.entries(errores).flatMap(([fila, cols]) => Object.keys(cols).map((col) => ({ fila, col })));
  const navegar = async (asignacionId: string, periodoId: string) => {
    await guardarAhora();
    const motivo = hayPendientes()
      ? "Hay cambios que no se han podido guardar."
      : celdasConError.length > 0
        ? `Hay ${celdasConError.length} celda(s) con error que no se guardarán.`
        : null;
    if (motivo && !window.confirm(`${motivo} ¿Cambiar de planilla de todos modos?`)) return;
    startTransition(() => router.push(`/docente/planilla?asignacion=${asignacionId}&periodo=${periodoId}`));
  };

  /* ---------------- resumen ---------------- */
  const resumen = useMemo(() => {
    const definitivas = data.filas.map((f) => {
      const v = valores[f.enrollmentId];
      return modoDirecto ? v.nota : calcularDefinitiva(actividades, v.notas, escala.decimales).nota;
    });
    const conNota = definitivas.filter((n): n is number => n !== null);
    const prom = conNota.length ? Math.round(conNota.reduce((a, b) => a + Math.round(b * 100), 0) / conNota.length) / 100 : null;
    const perdidos = data.filas.filter((f) => f.nota !== null && reprueba(f.nota, escala));
    return {
      total: data.filas.length,
      completas: conNota.length,
      promedio: prom,
      reprobados: conNota.filter((n) => reprueba(n, escala)).length,
      perdidos: perdidos.length,
      recuperados: perdidos.filter((f) => valores[f.enrollmentId].recuperacion !== null).length,
    };
  }, [data.filas, valores, actividades, modoDirecto, escala]);
  const suma = Math.round(actividades.reduce((a, l) => a + l.porcentaje * 100, 0)) / 100;
  const pct = resumen.total ? Math.floor((resumen.completas / resumen.total) * 100) : 0;
  const nombreGrupo = asignacion.grupo;

  // Periodo cuya recuperación está abierta (para el botón de acceso rápido).
  const enVentana = periodos.find((p) => p.ventanaRecuperacion);

  return (
    <div className={`space-y-4 px-4 py-5 lg:px-6 ${navegando ? "pointer-events-none opacity-60" : ""}`} aria-busy={navegando}>
      <Selector
        asignaciones={asignaciones}
        actual={asignacion}
        periodos={periodos}
        periodo={periodo}
        enVentana={enVentana}
        topeRecuperacion={topeRecuperacion}
        decimales={escala.decimales}
        esCoordinacion={esCoordinacion}
        navegar={navegar}
      />

      {/* Barra de avance y acciones */}
      <section className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-line bg-surface px-5 py-4 shadow-sm">
        {recuperando ? (
          <p className="text-[13px] text-ink">
            <span className="font-semibold">Recuperación de {periodo.nombre}</span> · {nombreGrupo}: {resumen.recuperados} de {resumen.perdidos} estudiantes
            con nota de recuperación · máximo {formatNota(topeRecuperacion, escala.decimales)}
          </p>
        ) : (
          <>
            <p className="text-[13px] text-ink">
              <span className="font-semibold">Avance {nombreGrupo}:</span> {resumen.completas}/{resumen.total} ({pct} %) ·{" "}
              <span className="font-semibold">Promedio:</span> {resumen.promedio === null ? "—" : formatNota(resumen.promedio, 2)}
              {resumen.reprobados > 0 && <span className="text-bad"> · {resumen.reprobados} en bajo</span>}
            </p>
            <div className="h-2 min-w-40 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avance de la planilla">
              <div className={`h-full rounded-full ${pct === 100 ? "bg-ok" : "bg-petroleo"}`} style={{ width: `${pct}%` }} />
            </div>
          </>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SaveStatus estado={estado} onReintentar={() => void guardarAhora()} />
          {!recuperando && actividades.length > 0 && (
            <span
              className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                suma === 100 ? "border-ok-line bg-ok-soft text-ok" : "border-warn-line bg-warn-soft text-warn"
              }`}
              title={suma === 100 ? undefined : "Si no suman 100 %, la definitiva se calcula proporcionalmente"}
            >
              Suma porcentajes: {suma} %
            </span>
          )}
          {data.modo === "edicion" && editable && (
            <ActividadForm assignmentId={asignacion.id} periodId={periodo.id} restante={Math.max(0, 100 - suma)} antes={guardarAhora} />
          )}
        </div>
      </section>

      {bloqueo && (
        <div className="flex items-start gap-2 rounded-xl border border-line-strong bg-slate-50 px-4 py-3 text-ink-soft">
          <IconLock className="mt-0.5 size-4 shrink-0 text-muted" />
          <p>{bloqueo}</p>
        </div>
      )}
      {data.modo === "edicion" && modoDirecto && (
        <p className="rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-warn">
          Esta planilla aún no tiene actividades. Agregue actividades con su porcentaje (quiz, taller, evaluación…) o digite la definitiva
          directamente en la columna <strong>Def.</strong>
        </p>
      )}
      {recuperando && (
        <p className="rounded-xl border border-petroleo/30 bg-petroleo-soft px-4 py-3 text-petroleo">
          {periodo.nombre} está cerrado. Durante el periodo siguiente puede registrar la recuperación de los{" "}
          <strong>{resumen.perdidos} estudiantes que perdieron</strong>. La nota de recuperación reemplaza a la del periodo en el boletín y no
          puede superar <strong>{formatNota(topeRecuperacion, escala.decimales)}</strong> ni bajar la nota obtenida.
        </p>
      )}

      {/* Grilla */}
      <div className="max-h-[calc(100vh-15rem)] overflow-auto rounded-2xl border border-line bg-surface shadow-sm">
        <table className="w-full min-w-max border-separate border-spacing-0 text-[13px]">
          <thead className="sticky top-0 z-20 bg-surface text-left text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
            <tr>
              <Th className="sticky left-0 z-10 w-12 bg-surface text-center">#</Th>
              <Th className="sticky left-12 z-10 min-w-72 border-r border-line bg-surface">Estudiante ({filas.length})</Th>
              {recuperando ? (
                <>
                  <Th className="w-24 text-center">Def. {`P${periodo.numero}`}</Th>
                  <Th className="w-36 text-center normal-case">
                    <span className="uppercase">Recuperación</span>
                    <span className="block font-mono text-[10px] font-medium text-petroleo">máx. {formatNota(topeRecuperacion, escala.decimales)}</span>
                  </Th>
                  <Th className="w-24 text-center">Nota final</Th>
                </>
              ) : (
                <>
                  {actividades.map((a) => (
                    <Th key={a.id} className="w-36 min-w-36 text-center normal-case">
                      <ActividadEncabezado actividad={a} editable={data.modo === "edicion" && editable} antes={guardarAhora} />
                    </Th>
                  ))}
                  {modoDirecto && <Th className="w-24 text-center">Def. {`P${periodo.numero}`}</Th>}
                  <Th className="w-20 text-center" title="Horas de inasistencia en el periodo">
                    Fallas
                  </Th>
                  {!modoDirecto && <Th className="w-20 text-center">Def. {`P${periodo.numero}`}</Th>}
                </>
              )}
              <Th className="w-32 text-center">Estado / corte</Th>
              <Th className="w-24 text-center">Observador</Th>
            </tr>
          </thead>
          <tbody ref={gridRef} onChange={onChange} onFocus={onFocus} onBlur={onBlur} onKeyDown={onKeyDown} onPaste={onPaste}>
            {filas.map((f, r) => (
              <FilaGrid
                key={f.enrollmentId}
                r={r}
                fila={f}
                valores={valores[f.enrollmentId]}
                textos={textos[f.enrollmentId] ?? VACIO}
                errores={errores[f.enrollmentId] ?? VACIO}
                columnas={columnas}
                actividades={actividades}
                escala={escala}
                editable={editable}
                recuperando={recuperando}
                numeroPeriodo={periodo.numero}
                hayCorte={data.corte !== null}
                onObservacion={guardarObservacion}
                puedeAbrirProceso={esCoordinacion}
              />
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={20} className="px-6 py-8 text-center text-muted">
                  {recuperando ? `Ningún estudiante perdió ${periodo.nombre.toLowerCase()} en esta asignatura.` : "El grupo no tiene estudiantes activos."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <p>
          <Kbd>Enter</Kbd> baja · <Kbd>←</Kbd>
          <Kbd>→</Kbd>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> se mueven · <Kbd>Esc</Kbd> deshace · «45» = 4,5 · puede pegar columnas desde Excel
          {data.corte && ` · corte preventivo del ${new Date(data.corte.realizadoAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}`}
        </p>
        <div className="flex items-center gap-3">
          {aviso && <span className="text-ink-soft">{aviso}</span>}
          {celdasConError.length > 0 && (
            <span className="flex items-center gap-1 font-medium text-bad">
              <IconAlert className="size-3.5" />
              {celdasConError.length} celda(s) con error (no se guardan)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Selector grado → salón → materia, periodos y recuperación          */
/* ------------------------------------------------------------------ */
function Selector({
  asignaciones,
  actual,
  periodos,
  periodo,
  enVentana,
  topeRecuperacion,
  decimales,
  esCoordinacion,
  navegar,
}: {
  asignaciones: OpcionAsignacion[];
  actual: OpcionAsignacion;
  periodos: OpcionPeriodo[];
  periodo: OpcionPeriodo;
  enVentana: OpcionPeriodo | undefined;
  topeRecuperacion: number;
  decimales: 1 | 2;
  esCoordinacion: boolean;
  navegar: (asignacionId: string, periodoId: string) => void;
}) {
  const grados = [...new Map(asignaciones.map((a) => [a.gradoCodigo, a.grado])).entries()];
  const salones = [...new Map(asignaciones.filter((a) => a.gradoCodigo === actual.gradoCodigo).map((a) => [a.groupId, a])).values()];
  const materias = asignaciones.filter((a) => a.groupId === actual.groupId);
  const cursos = new Set(asignaciones.map((a) => a.groupId)).size;

  const ir = (a: OpcionAsignacion | undefined) => a && a.id !== actual.id && navegar(a.id, periodo.id);
  // Al cambiar de grado o salón se conserva la materia si existe allí.
  const mismaMateria = (lista: OpcionAsignacion[]) => lista.find((a) => a.asignatura === actual.asignatura) ?? lista[0];

  return (
    <section className="rounded-2xl border border-line bg-surface px-5 py-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-petroleo uppercase">
            {esCoordinacion
              ? `Coordinación · todas las planillas del colegio (${cursos} cursos)`
              : `Carga académica exclusiva del docente (${cursos} curso${cursos === 1 ? "" : "s"} asignado${cursos === 1 ? "" : "s"})`}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-ink">{actual.docente}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Periodo" className="flex rounded-xl border border-line bg-canvas p-1">
            {periodos.map((p) => {
              const activo = p.id === periodo.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => !activo && navegar(actual.id, p.id)}
                  title={`${p.nombre} · ${p.porcentaje} % · ${p.cerrado ? "cerrado" : "abierto"}`}
                  className={`flex items-center gap-1 rounded-lg px-3.5 py-1.5 text-sm font-semibold ${
                    activo ? "bg-petroleo text-white shadow-sm" : "text-ink-soft hover:bg-surface"
                  }`}
                >
                  P{p.numero}
                  {p.cerrado && <IconLock className="size-3" />}
                </button>
              );
            })}
          </div>
          {enVentana && enVentana.id !== periodo.id && (
            <button
              type="button"
              onClick={() => navegar(actual.id, enVentana.id)}
              className="flex items-center gap-2 rounded-xl border border-warn-line bg-warn-soft px-3.5 py-2 text-sm font-semibold text-warn hover:border-warn"
            >
              ↻ Recuperación P{enVentana.numero} (máx. {formatNota(topeRecuperacion, decimales).replace(".", ",")})
            </button>
          )}
        </div>
      </div>
      <dl className="mt-4 space-y-3">
        <Fila etiqueta="Grado">
          {grados.map(([codigo, nombre]) => (
            <Chip key={codigo} activo={codigo === actual.gradoCodigo} onClick={() => ir(mismaMateria(asignaciones.filter((a) => a.gradoCodigo === codigo)))}>
              {nombre}
            </Chip>
          ))}
        </Fila>
        <Fila etiqueta="Salón">
          {salones.map((s) => (
            <Chip key={s.groupId} activo={s.groupId === actual.groupId} onClick={() => ir(mismaMateria(asignaciones.filter((a) => a.groupId === s.groupId)))}>
              {s.grupo} <span className="font-normal opacity-70">({s.estudiantes} est.)</span>
            </Chip>
          ))}
        </Fila>
        <Fila etiqueta="Materia">
          {materias.map((m) => (
            <Chip key={m.id} activo={m.id === actual.id} onClick={() => ir(m)} title={esCoordinacion ? `Docente: ${m.docente}` : undefined}>
              {m.asignatura}
            </Chip>
          ))}
        </Fila>
      </dl>
    </section>
  );
}

function Fila({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <dt className="w-20 shrink-0 text-xs font-semibold tracking-wide text-muted uppercase">{etiqueta}</dt>
      <dd className="flex flex-wrap gap-2">{children}</dd>
    </div>
  );
}

function Chip({ activo, children, onClick, title }: { activo: boolean; children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      title={title}
      className={`rounded-xl border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
        activo ? "border-petroleo bg-petroleo text-white" : "border-line bg-surface text-ink-soft hover:border-line-strong"
      }`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Actividades: agregar, renombrar, cambiar %, eliminar               */
/* ------------------------------------------------------------------ */
const estadoInicial: EstadoActividad = { ok: false, error: null };

function ActividadForm({
  assignmentId,
  periodId,
  restante,
  antes,
  actividad,
  onCerrar,
}: {
  assignmentId: string;
  periodId: string;
  restante: number;
  antes: () => Promise<void>;
  actividad?: ActividadPlanilla;
  onCerrar?: () => void;
}) {
  const [abierto, setAbierto] = useState(!!actividad);
  const [estado, enviar, pendiente] = useActionState(actividad ? editarActividad : crearActividad, estadoInicial);
  const [previo, setPrevio] = useState(estado);
  if (previo !== estado) {
    setPrevio(estado);
    if (estado.ok) {
      setAbierto(false);
      onCerrar?.();
    }
  }
  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1.5 rounded-xl bg-petroleo px-4 py-2 text-sm font-semibold text-white hover:bg-petroleo-hover"
      >
        <span aria-hidden className="text-base leading-none">+</span> Agregar actividad / nota
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        iniciarTransicion(async () => {
          await antes(); // primero se guardan las notas pendientes
          enviar(datos);
        });
      }}
      className={`flex flex-wrap items-end gap-2 rounded-xl border border-line bg-canvas p-2 text-left normal-case ${actividad ? "" : "shadow-sm"}`}
    >
      {actividad ? (
        <input type="hidden" name="id" value={actividad.id} />
      ) : (
        <>
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <input type="hidden" name="periodId" value={periodId} />
        </>
      )}
      <label className="text-[11px] font-medium tracking-normal text-ink-soft">
        Nombre de la actividad
        <input
          name="nombre"
          defaultValue={actividad?.nombre}
          required
          maxLength={60}
          autoFocus
          placeholder="Ej.: Quiz temático"
          className="mt-0.5 block h-8 w-44 rounded-lg border border-line-strong bg-surface px-2 text-[13px] font-normal text-ink outline-none focus-visible:border-petroleo"
        />
      </label>
      <label className="text-[11px] font-medium tracking-normal text-ink-soft">
        %
        <input
          name="porcentaje"
          type="number"
          step="0.01"
          min="0.01"
          max="100"
          required
          defaultValue={actividad?.porcentaje ?? (restante > 0 ? restante : undefined)}
          className="mt-0.5 block h-8 w-20 rounded-lg border border-line-strong bg-surface px-2 text-[13px] font-normal text-ink outline-none focus-visible:border-petroleo"
        />
      </label>
      <button type="submit" disabled={pendiente} className="h-8 rounded-lg bg-petroleo px-3 text-[13px] font-semibold text-white disabled:opacity-60">
        {pendiente ? "…" : actividad ? "Guardar" : "Agregar"}
      </button>
      <button
        type="button"
        onClick={() => {
          setAbierto(false);
          onCerrar?.();
        }}
        className="h-8 px-2 text-xs font-medium text-muted hover:text-ink"
      >
        Cancelar
      </button>
      {estado.error && (
        <p role="alert" className="w-full text-xs font-normal text-bad">
          {estado.error}
        </p>
      )}
    </form>
  );
}

function ActividadEncabezado({ actividad: a, editable, antes }: { actividad: ActividadPlanilla; editable: boolean; antes: () => Promise<void> }) {
  const [editando, setEditando] = useState(false);
  const [estado, eliminar, eliminando] = useActionState(eliminarActividad, estadoInicial);
  if (editando) {
    return (
      <div className="absolute z-30 mt-1 w-max">
        <ActividadForm assignmentId="" periodId="" restante={0} antes={antes} actividad={a} onCerrar={() => setEditando(false)} />
      </div>
    );
  }
  return (
    <div className="flex items-start justify-center gap-1">
      <div>
        <span className="block text-[12px] font-semibold leading-4 tracking-normal text-ink">{a.nombre}</span>
        <span className="block font-mono text-[10px] font-medium text-petroleo">{a.porcentaje}%</span>
        {estado.error && <span className="block max-w-32 text-[10px] font-normal text-bad">{estado.error}</span>}
      </div>
      {editable && (
        <span className="flex shrink-0 gap-0.5 text-muted">
          <button type="button" onClick={() => setEditando(true)} className="rounded p-0.5 hover:bg-slate-100 hover:text-ink" aria-label={`Editar ${a.nombre}`} title="Editar nombre o porcentaje">
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
              <path d="M10.5 2.5 13.5 5.5 5.5 13.5H2.5V10.5Z" />
            </svg>
          </button>
          <button
            type="button"
            disabled={eliminando}
            onClick={() => {
              if (!window.confirm(`¿Eliminar «${a.nombre}» y todas sus notas? No se puede deshacer.`)) return;
              const datos = new FormData();
              datos.set("id", a.id);
              iniciarTransicion(async () => {
                await antes();
                eliminar(datos);
              });
            }}
            className="rounded p-0.5 hover:bg-bad-soft hover:text-bad"
            aria-label={`Eliminar ${a.nombre}`}
            title="Eliminar actividad"
          >
            <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
              <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 9h6l.5-9" />
            </svg>
          </button>
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Fila (memo: al digitar solo se re-renderiza la fila editada)       */
/* ------------------------------------------------------------------ */
type FilaProps = {
  r: number;
  fila: FilaPlanilla;
  valores: Valores;
  textos: Record<string, string>;
  errores: Record<string, string>;
  columnas: Columna[];
  actividades: ActividadPlanilla[];
  escala: Escala;
  editable: boolean;
  recuperando: boolean;
  numeroPeriodo: number;
  hayCorte: boolean;
  onObservacion: (enrollmentId: string, texto: string) => void;
  puedeAbrirProceso: boolean;
};

const FilaGrid = memo(function FilaGrid({ r, fila, valores, textos, errores, columnas, actividades, escala, editable, recuperando, hayCorte, onObservacion, puedeAbrirProceso }: FilaProps) {
  const modoDirecto = actividades.length === 0;
  const calculo = calcularDefinitiva(actividades, valores.notas, escala.decimales);
  const nota = recuperando ? fila.nota : modoDirecto ? valores.nota : calculo.nota;
  const final = recuperando ? (valores.recuperacion ?? fila.nota) : nota;
  const desempeno = final !== null ? desempenoDe(final, escala) : "PENDIENTE";
  const enBajo = final !== null && reprueba(final, escala);
  const iniciales = fila.nombre
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("");

  const input = (col: Columna, c: number) => {
    const error = errores[col.key];
    const texto = textos[col.key] ?? textoDe(valores, col, escala.decimales);
    const valor = col.tipo !== "fallas" && !error ? leer(valores, col) : null;
    const bajo = valor !== null && reprueba(valor, escala);
    const esFallas = col.tipo === "fallas";
    return (
      <input
        data-r={r}
        data-c={c}
        value={texto}
        readOnly={!editable}
        onChange={noop}
        inputMode={esFallas ? "numeric" : "decimal"}
        autoComplete="off"
        maxLength={6}
        placeholder={esFallas ? "0" : undefined}
        aria-label={`${etiquetaColumna(col)} de ${fila.nombre}`}
        aria-invalid={error ? true : undefined}
        title={error}
        className={`celda mx-auto block h-9 rounded-lg border text-center font-mono text-sm outline-none ${esFallas ? "w-14" : "w-20"} ${
          error
            ? "border-bad bg-bad-soft text-bad"
            : bajo
              ? "border-bad-line bg-surface font-semibold text-bad"
              : "border-line bg-surface text-ink"
        } ${editable ? "focus:border-petroleo focus:ring-2 focus:ring-petroleo/20" : "cursor-default bg-canvas text-ink-soft"}`}
      />
    );
  };

  return (
    <tr className={`group ${enBajo ? "bg-bad-soft/40" : ""}`}>
      <td className="sticky left-0 z-10 border-b border-line bg-inherit text-center font-mono text-xs text-muted tabular-nums">
        <span className="block bg-surface/0">{String(r + 1).padStart(2, "0")}</span>
      </td>
      <td className="sticky left-12 z-10 border-r border-b border-line bg-surface px-3 py-2">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={`grid size-8 shrink-0 place-items-center rounded-full text-[11px] font-bold ${enBajo ? "bg-bad-soft text-bad" : "bg-petroleo-soft text-petroleo"}`}
          >
            {iniciales}
          </span>
          <span className="min-w-0">
            <span className="block max-w-60 truncate font-medium text-ink" title={fila.nombre}>
              {fila.nombre}
            </span>
            <span className="block font-mono text-[11px] text-muted">Doc. {fila.documento}</span>
          </span>
        </div>
      </td>

      {recuperando ? (
        <>
          <td className="border-b border-line text-center font-mono font-semibold text-bad tabular-nums">{formatNota(fila.nota, escala.decimales)}</td>
          <td className="border-b border-line px-2 py-2">{input(columnas[0], 0)}</td>
          <td className={`border-b border-line text-center font-mono text-base font-semibold tabular-nums ${enBajo ? "text-bad" : "text-ink"}`}>
            {formatNota(final, escala.decimales)}
          </td>
        </>
      ) : (
        <>
          {columnas.map((col, c) =>
            col.tipo === "actividad" || col.tipo === "nota" ? (
              <td key={col.key} className="border-b border-line px-2 py-2">
                {input(col, c)}
              </td>
            ) : null,
          )}
          <td className="border-b border-line px-2 py-2">{input(columnas[columnas.length - 1], columnas.length - 1)}</td>
          {!modoDirecto && (
            <td className="border-b border-line text-center">
              {nota !== null ? (
                <span className={`font-mono text-base font-semibold tabular-nums ${enBajo ? "text-bad" : "text-ink"}`}>{formatNota(nota, escala.decimales)}</span>
              ) : calculo.parcial !== null ? (
                <span className="font-mono text-muted italic tabular-nums" title={`Parcial: faltan ${calculo.faltantes} de ${actividades.length} actividades`}>
                  {formatNota(calculo.parcial, escala.decimales)}
                </span>
              ) : (
                <span className="text-slate-300">—</span>
              )}
            </td>
          )}
        </>
      )}

      <td className="border-b border-line px-2 text-center">
        <DesempenoBadge desempeno={desempeno} />
        {hayCorte && (
          <span className={`mt-0.5 block font-mono text-[10px] ${fila.corte !== null && reprueba(fila.corte, escala) ? "text-bad" : "text-muted"}`}>
            corte {fila.corte === null ? "—" : formatNota(fila.corte, escala.decimales)}
          </span>
        )}
      </td>
      <td className="border-b border-line px-2 text-center">
        <ObservadorDialogo
          enrollmentNombre={fila.nombre}
          enrollmentId={fila.enrollmentId}
          studentId={fila.studentId}
          puedeAbrirProceso={puedeAbrirProceso}
          observacion={valores.observacion}
          puedeEditarObservacion={editable && !recuperando}
          onObservacion={onObservacion}
        />
      </td>
    </tr>
  );
});

const noop = () => {};

function etiquetaColumna(col: Columna) {
  switch (col.tipo) {
    case "actividad":
      return `Nota ${col.actividad.nombre}`;
    case "nota":
      return "Nota definitiva";
    case "fallas":
      return "Fallas";
    case "recuperacion":
      return "Nota de recuperación";
  }
}

function Th({ className = "", ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={`relative border-b border-line px-2 py-3 align-bottom ${className}`} {...props} />;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="mx-0.5 inline-block rounded-sm border border-line-strong bg-surface px-1 font-mono text-[10px] leading-4 text-ink-soft">{children}</kbd>;
}
