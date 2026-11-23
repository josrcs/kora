import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { withTenant, type Tx } from "@/db/client";
import { errorPostgres } from "@/db/errors";
import { activityScores, enrollments, grades, institutions } from "@/db/schema";
import type { Session } from "@/lib/auth/session";
import { calcularDefinitiva, errorNota, reprueba, type Escala } from "@/lib/grading/calc";
import { leerEscala } from "@/lib/grading/escala.server";
import type { ActividadPlanilla, Cambio, GuardarInput, GuardarResultado } from "../types";
import { leerActividades, leerContexto, puedeEditar, ventanaRecuperacion, type ContextoPlanilla } from "./queries";

class Rechazo extends Error {
  constructor(
    readonly codigo: Exclude<GuardarResultado, { ok: true }>["codigo"],
    message: string,
  ) {
    super(message);
  }
}

/**
 * Guarda un lote de celdas de la planilla en UNA transacción.
 *  - Periodo abierto: notas de actividades (o definitiva directa si no hay
 *    actividades), fallas y observación; el servidor recalcula la definitiva.
 *  - Periodo cerrado en ventana de recuperación: solo la nota de recuperación
 *    de quienes perdieron, con el tope del colegio.
 * La base vuelve a validar todo con triggers (periodo, escala, autoría, tope).
 */
export async function guardarPlanilla(session: Session, input: GuardarInput): Promise<GuardarResultado> {
  try {
    return await withTenant(session, async (tx) => {
      const ctx = await leerContexto(tx, session.institutionId, input.assignmentId, input.periodId);
      if (!ctx) throw new Rechazo("SIN_PERMISO", "La planilla no existe o no pertenece a su institución.");
      if (!puedeEditar(session, ctx.assignment.teacherId)) {
        throw new Rechazo("SIN_PERMISO", "Solo el docente asignado o coordinación pueden modificar estas calificaciones.");
      }
      const escala = await leerEscala(tx, session.institutionId);
      const cambios = ultimoPorCelda(input.cambios);
      const recuperaciones = cambios.filter((c): c is Extract<Cambio, { campo: "recuperacion" }> => c.campo === "recuperacion");

      if (recuperaciones.length) {
        if (recuperaciones.length !== cambios.length) throw new Rechazo("VALIDACION", "La recuperación se guarda sola. Recargue la planilla.");
        return guardarRecuperaciones(tx, session, ctx, escala, recuperaciones);
      }

      if (ctx.period.cerrado) {
        throw new Rechazo("PERIODO_CERRADO", `${ctx.period.nombre} está cerrado por coordinación. Los cambios no se guardaron.`);
      }
      const actividades = await leerActividades(tx, ctx);
      const ids = new Set(actividades.map((a) => a.id));

      for (const c of cambios) {
        if (c.campo === "actividad" && !ids.has(c.activityId)) {
          throw new Rechazo("VALIDACION", "Una de las actividades ya no existe. Recargue la planilla.");
        }
        if (c.campo === "nota" && actividades.length > 0) {
          throw new Rechazo("VALIDACION", "La definitiva se calcula a partir de las actividades; no se digita.");
        }
        if ((c.campo === "actividad" || c.campo === "nota") && c.valor !== null) {
          const error = errorNota(c.valor, escala);
          if (error) throw new Rechazo("VALIDACION", `Nota ${c.valor}: ${error}.`);
        }
      }

      const afectadas = [...new Set(cambios.map((c) => c.enrollmentId))];
      await exigirMatriculasDelGrupo(tx, ctx, afectadas);

      /* 1. Notas de actividades */
      const notas = cambios.filter((c): c is Extract<Cambio, { campo: "actividad" }> => c.campo === "actividad");
      const aGuardar = notas.filter((c) => c.valor !== null);
      if (aGuardar.length) {
        await tx
          .insert(activityScores)
          .values(
            aGuardar.map((c) => ({
              institutionId: session.institutionId,
              activityId: c.activityId,
              enrollmentId: c.enrollmentId,
              nota: c.valor as number,
              updatedBy: session.userId,
            })),
          )
          .onConflictDoUpdate({
            target: [activityScores.activityId, activityScores.enrollmentId],
            set: { nota: sql`excluded.nota`, updatedBy: sql`excluded.updated_by` },
            setWhere: sql`${activityScores.nota} IS DISTINCT FROM excluded.nota`,
          });
      }
      for (const c of notas.filter((p) => p.valor === null)) {
        await tx.delete(activityScores).where(and(eq(activityScores.activityId, c.activityId), eq(activityScores.enrollmentId, c.enrollmentId)));
      }

      /* 2. Definitiva, fallas y observación */
      const directos = new Map<string, { nota?: number | null; fallas?: number; observacion?: string | null }>();
      for (const c of cambios) {
        const d = directos.get(c.enrollmentId) ?? {};
        if (c.campo === "nota") d.nota = c.valor;
        if (c.campo === "fallas") d.fallas = c.valor;
        if (c.campo === "observacion") d.observacion = c.valor.trim() || null;
        directos.set(c.enrollmentId, d);
      }
      const definitivas = await recalcularDefinitivas(tx, session, ctx, escala, actividades, afectadas, directos);
      return { ok: true as const, guardadoEn: new Date().toISOString(), definitivas };
    });
  } catch (err) {
    if (err instanceof Rechazo) return { ok: false, codigo: err.codigo, error: err.message };
    const pg = errorPostgres(err);
    if (pg?.hint === "PERIODO_CERRADO" || pg?.hint === "FUERA_DE_VENTANA") return { ok: false, codigo: "PERIODO_CERRADO", error: pg.message };
    if (pg?.hint === "SIN_PERMISO") return { ok: false, codigo: "SIN_PERMISO", error: pg.message };
    if (pg?.code === "23514") return { ok: false, codigo: "VALIDACION", error: pg.message };
    console.error("[planilla] error al guardar", err);
    return { ok: false, codigo: "ERROR", error: "No se pudo guardar. Se reintentará automáticamente." };
  }
}

async function exigirMatriculasDelGrupo(tx: Tx, ctx: ContextoPlanilla, ids: string[]) {
  if (!ids.length) return;
  const activas = await tx
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(and(inArray(enrollments.id, ids), eq(enrollments.groupId, ctx.assignment.groupId), eq(enrollments.estado, "ACTIVA")));
  if (activas.length !== ids.length) {
    throw new Rechazo("VALIDACION", "Hay estudiantes que ya no están matriculados en el grupo. Recargue la planilla.");
  }
}

/**
 * Recalcula y guarda la definitiva de las filas indicadas (todas si `ids` es null)
 * a partir de las notas de actividades que hay en la base. Si no hay actividades,
 * la definitiva es la digitada. Conserva fallas y observación salvo que vengan en `directos`.
 */
export async function recalcularDefinitivas(
  tx: Tx,
  session: Session,
  ctx: ContextoPlanilla,
  escala: Escala,
  actividades: ActividadPlanilla[],
  ids: string[] | null,
  directos = new Map<string, { nota?: number | null; fallas?: number; observacion?: string | null }>(),
): Promise<Record<string, number | null>> {
  const filtroFilas = ids ? inArray(grades.enrollmentId, ids) : undefined;
  const existentes = new Map(
    (
      await tx
        .select()
        .from(grades)
        .where(and(eq(grades.teacherAssignmentId, ctx.assignment.id), eq(grades.periodId, ctx.period.id), filtroFilas))
        .for("update")
    ).map((g) => [g.enrollmentId, g]),
  );
  const objetivo =
    ids ??
    (
      await tx
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(and(eq(enrollments.groupId, ctx.assignment.groupId), eq(enrollments.estado, "ACTIVA")))
    ).map((e) => e.id);

  const notasPorFila = new Map<string, Record<string, number>>();
  if (actividades.length && objetivo.length) {
    const rows = await tx
      .select({ enrollmentId: activityScores.enrollmentId, activityId: activityScores.activityId, nota: activityScores.nota })
      .from(activityScores)
      .where(and(inArray(activityScores.activityId, actividades.map((a) => a.id)), inArray(activityScores.enrollmentId, objetivo)));
    for (const r of rows) {
      const n = notasPorFila.get(r.enrollmentId) ?? {};
      n[r.activityId] = r.nota;
      notasPorFila.set(r.enrollmentId, n);
    }
  }

  const definitivas: Record<string, number | null> = {};
  const filas: (typeof grades.$inferInsert)[] = [];
  for (const enrollmentId of objetivo) {
    const prev = existentes.get(enrollmentId);
    const d = directos.get(enrollmentId) ?? {};
    let nota = d.nota !== undefined ? d.nota : (prev?.nota ?? null);
    const fallas = d.fallas ?? prev?.fallas ?? 0;
    const observacion = d.observacion !== undefined ? d.observacion : (prev?.observacion ?? null);
    if (actividades.length) nota = calcularDefinitiva(actividades, notasPorFila.get(enrollmentId) ?? {}, escala.decimales).nota;
    definitivas[enrollmentId] = nota;

    const igual = prev && prev.nota === nota && prev.fallas === fallas && (prev.observacion ?? null) === observacion;
    if (igual) continue;
    if (!prev && nota === null && fallas === 0 && observacion === null) continue;
    filas.push({
      institutionId: session.institutionId,
      enrollmentId,
      teacherAssignmentId: ctx.assignment.id,
      periodId: ctx.period.id,
      nota,
      fallas,
      fallasJustificadas: Math.min(prev?.fallasJustificadas ?? 0, fallas),
      observacion,
      updatedBy: session.userId,
    });
  }
  if (filas.length) {
    await tx
      .insert(grades)
      .values(filas)
      .onConflictDoUpdate({
        target: [grades.enrollmentId, grades.teacherAssignmentId, grades.periodId],
        set: {
          nota: sql`excluded.nota`,
          fallas: sql`excluded.fallas`,
          fallasJustificadas: sql`excluded.fallas_justificadas`,
          observacion: sql`excluded.observacion`,
          updatedBy: sql`excluded.updated_by`,
        },
      });
  }
  return definitivas;
}

async function guardarRecuperaciones(
  tx: Tx,
  session: Session,
  ctx: ContextoPlanilla,
  escala: Escala,
  cambios: Extract<Cambio, { campo: "recuperacion" }>[],
): Promise<GuardarResultado> {
  if (!ctx.period.cerrado || !(await ventanaRecuperacion(tx, ctx.period.id))) {
    throw new Rechazo(
      "PERIODO_CERRADO",
      `La recuperación de ${ctx.period.nombre} solo se registra con el periodo cerrado y durante el periodo siguiente.`,
    );
  }
  const [inst] = await tx.select({ tope: institutions.notaMaxRecuperacion }).from(institutions).where(eq(institutions.id, session.institutionId));
  const filas = new Map(
    (
      await tx
        .select()
        .from(grades)
        .where(
          and(
            eq(grades.teacherAssignmentId, ctx.assignment.id),
            eq(grades.periodId, ctx.period.id),
            inArray(grades.enrollmentId, cambios.map((c) => c.enrollmentId)),
          ),
        )
        .for("update")
    ).map((g) => [g.enrollmentId, g]),
  );

  const definitivas: Record<string, number | null> = {};
  for (const c of cambios) {
    const g = filas.get(c.enrollmentId);
    if (!g || g.nota === null || !reprueba(g.nota, escala)) {
      throw new Rechazo("VALIDACION", "Solo se recuperan asignaturas perdidas en el periodo.");
    }
    if (c.valor !== null) {
      const error = errorNota(c.valor, escala);
      if (error) throw new Rechazo("VALIDACION", `Nota ${c.valor}: ${error}.`);
      if (c.valor > inst.tope) throw new Rechazo("VALIDACION", `La nota de recuperación no puede superar ${inst.tope.toFixed(1)}.`);
      if (c.valor < g.nota) throw new Rechazo("VALIDACION", `La recuperación no puede bajar la nota del periodo (${g.nota.toFixed(1)}).`);
    }
    definitivas[c.enrollmentId] = g.nota;
    if (g.notaRecuperacion === c.valor) continue; // sin cambio (la base solo admite actualizar la recuperación si cambia)
    await tx
      .update(grades)
      .set({
        notaRecuperacion: c.valor,
        recuperadaAt: c.valor === null ? null : sql`now()`,
        recuperadaPor: c.valor === null ? null : session.userId,
        updatedBy: session.userId,
      })
      .where(eq(grades.id, g.id));
  }
  return { ok: true, guardadoEn: new Date().toISOString(), definitivas };
}

/** Si el lote trae dos cambios a la misma celda, gana el último. */
function ultimoPorCelda(cambios: Cambio[]): Cambio[] {
  const porCelda = new Map<string, Cambio>();
  for (const c of cambios) porCelda.set(`${c.enrollmentId}:${c.campo === "actividad" ? c.activityId : c.campo}`, c);
  return [...porCelda.values()];
}
