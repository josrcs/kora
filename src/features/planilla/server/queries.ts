import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { withTenant, type Tx } from "@/db/client";
import {
  attendanceSessions,
  academicYears,
  achievements,
  activities,
  activityScores,
  enrollments,
  gradeLevels,
  grades,
  groups,
  institutions,
  periods,
  preventiveCutGrades,
  preventiveCuts,
  subjects,
  teacherAssignments,
  users,
} from "@/db/schema";
import { ROLES_PLANILLA, type Session } from "@/lib/auth/session";
import { leerEscala } from "@/lib/grading/escala.server";
import type { ActividadPlanilla, FilaPlanilla, LogroPlanilla, ModoPlanilla, OpcionAsignacion, OpcionPeriodo, PlanillaData } from "../types";

/** Quién abre planillas: el docente (solo las suyas) y coordinación (todas). */
export const ROLES_LECTURA = ROLES_PLANILLA;

/**
 * Regla central de acceso a una planilla: coordinación ve y edita todas; el
 * docente solo las asignaciones que coordinación le asignó. Nadie más.
 * (La base lo repite en fn_assert_editor_asignacion.)
 */
export function puedeEditar(session: Session, teacherId: string) {
  return session.rol === "COORDINATOR" || (session.rol === "TEACHER" && session.userId === teacherId);
}

/* ------------------------------------------------------------------ */
/*  Carga académica del docente en el año activo + periodos            */
/* ------------------------------------------------------------------ */
export async function getCargaDocente(session: Session): Promise<{ asignaciones: OpcionAsignacion[]; periodos: OpcionPeriodo[] }> {
  return withTenant(session, async (tx) => {
    const [anio] = await tx
      .select({ id: academicYears.id })
      .from(academicYears)
      .where(and(eq(academicYears.institutionId, session.institutionId), eq(academicYears.activo, true)));
    if (!anio || !(ROLES_PLANILLA as readonly string[]).includes(session.rol)) return { asignaciones: [], periodos: [] };

    // El docente solo recibe SUS asignaciones; coordinación, todas.
    const filtroDocente = session.rol === "TEACHER" ? eq(teacherAssignments.teacherId, session.userId) : undefined;

    const rows = await tx
      .select({
        id: teacherAssignments.id,
        groupId: groups.id,
        grupo: groups.codigo,
        grado: gradeLevels.nombre,
        gradoCodigo: gradeLevels.codigo,
        asignatura: subjects.nombre,
        intensidadHoraria: teacherAssignments.intensidadHoraria,
        docente: users.nombreCompleto,
        estudiantes: sql<number>`(select count(*)::int from enrollments e where e.group_id = ${groups.id} and e.estado = 'ACTIVA')`,
      })
      .from(teacherAssignments)
      .innerJoin(groups, eq(groups.id, teacherAssignments.groupId))
      .innerJoin(gradeLevels, eq(gradeLevels.id, groups.gradeLevelId))
      .innerJoin(subjects, eq(subjects.id, teacherAssignments.subjectId))
      .innerJoin(users, eq(users.id, teacherAssignments.teacherId))
      .where(and(eq(teacherAssignments.institutionId, session.institutionId), eq(groups.academicYearId, anio.id), filtroDocente))
      .orderBy(asc(gradeLevels.codigo), asc(groups.codigo), asc(subjects.nombre));

    return {
      asignaciones: rows.map((r) => ({ ...r, docente: r.docente ?? "" })),
      periodos: await leerPeriodos(tx, anio.id),
    };
  });
}

async function leerPeriodos(tx: Tx, academicYearId: string): Promise<OpcionPeriodo[]> {
  const rows = await tx
    .select({ p: periods, ventana: sql<boolean>`fn_ventana_recuperacion(${periods.id})` })
    .from(periods)
    .where(eq(periods.academicYearId, academicYearId))
    .orderBy(asc(periods.numero));
  return rows.map(({ p, ventana }) => ({
    id: p.id,
    numero: p.numero,
    nombre: p.nombre,
    porcentaje: p.porcentaje,
    fechaInicio: p.fechaInicio,
    fechaFin: p.fechaFin,
    fechaLimiteNotas: p.fechaLimiteNotas,
    fechaCorte: p.fechaCorte,
    cerrado: p.cerrado,
    cerradoAt: p.cerradoAt?.toISOString() ?? null,
    ventanaRecuperacion: !!ventana,
  }));
}

/** Periodo por defecto: el que contiene la fecha de hoy; si no, el primero abierto; si no, el último. */
export function periodoPorDefecto<T extends { fechaInicio: string; fechaFin: string; cerrado: boolean }>(periodos: T[], hoy = new Date()): T | undefined {
  const iso = hoy.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  return periodos.find((p) => p.fechaInicio <= iso && iso <= p.fechaFin) ?? periodos.find((p) => !p.cerrado) ?? periodos.at(-1);
}

/* ------------------------------------------------------------------ */
/*  Contexto de una asignación + periodo, validado                     */
/* ------------------------------------------------------------------ */
export type ContextoPlanilla = {
  assignment: { id: string; groupId: string; subjectId: string; teacherId: string; gradeLevelId: string; academicYearId: string };
  period: typeof periods.$inferSelect;
};

/** Devuelve null si la asignación o el periodo no existen, no son del colegio o no corresponden entre sí. */
export async function leerContexto(tx: Tx, institutionId: string, assignmentId: string, periodId: string): Promise<ContextoPlanilla | null> {
  const [assignment] = await tx
    .select({
      id: teacherAssignments.id,
      groupId: teacherAssignments.groupId,
      subjectId: teacherAssignments.subjectId,
      teacherId: teacherAssignments.teacherId,
      gradeLevelId: groups.gradeLevelId,
      academicYearId: groups.academicYearId,
    })
    .from(teacherAssignments)
    .innerJoin(groups, eq(groups.id, teacherAssignments.groupId))
    .where(and(eq(teacherAssignments.id, assignmentId), eq(teacherAssignments.institutionId, institutionId)));
  if (!assignment) return null;

  const [period] = await tx
    .select()
    .from(periods)
    .where(and(eq(periods.id, periodId), eq(periods.institutionId, institutionId), eq(periods.academicYearId, assignment.academicYearId)));
  if (!period) return null;
  return { assignment, period };
}

export async function leerActividades(tx: Tx, ctx: ContextoPlanilla): Promise<ActividadPlanilla[]> {
  return tx
    .select({ id: activities.id, nombre: activities.nombre, porcentaje: activities.porcentaje, orden: activities.orden })
    .from(activities)
    .where(and(eq(activities.teacherAssignmentId, ctx.assignment.id), eq(activities.periodId, ctx.period.id)))
    .orderBy(asc(activities.orden), asc(activities.createdAt));
}

export async function ventanaRecuperacion(tx: Tx, periodId: string): Promise<boolean> {
  const { rows } = await tx.execute<{ v: boolean }>(sql`select fn_ventana_recuperacion(${periodId}) as v`);
  return !!rows[0]?.v;
}

/* ------------------------------------------------------------------ */
/*  Planilla completa                                                  */
/* ------------------------------------------------------------------ */
export async function getPlanilla(session: Session, asignacion: OpcionAsignacion, periodo: OpcionPeriodo): Promise<PlanillaData | null> {
  return withTenant(session, async (tx) => {
    const ctx = await leerContexto(tx, session.institutionId, asignacion.id, periodo.id);
    if (!ctx) return null;
    // Nadie ve una planilla ajena salvo coordinación.
    if (!puedeEditar(session, ctx.assignment.teacherId)) return null;

    // Una transacción = una conexión: las consultas van en serie.
    const escala = await leerEscala(tx, session.institutionId);
    const [inst] = await tx.select({ tope: institutions.notaMaxRecuperacion }).from(institutions).where(eq(institutions.id, session.institutionId));
    const actividades = await leerActividades(tx, ctx);
    const logros: LogroPlanilla[] = await tx
      .select({ id: achievements.id, codigo: achievements.codigo, descripcion: achievements.descripcion })
      .from(achievements)
      .where(
        and(
          eq(achievements.periodId, ctx.period.id),
          eq(achievements.subjectId, ctx.assignment.subjectId),
          eq(achievements.gradeLevelId, ctx.assignment.gradeLevelId),
        ),
      )
      .orderBy(asc(achievements.orden));

    const estudiantes = await tx
      .select({ enrollmentId: enrollments.id, studentId: users.id, documento: users.documentoIdentidad, nombre: users.nombreCompleto })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.studentId))
      .where(and(eq(enrollments.groupId, ctx.assignment.groupId), eq(enrollments.estado, "ACTIVA")))
      .orderBy(asc(users.apellidos), asc(users.nombres));

    const ids = estudiantes.map((e) => e.enrollmentId);
    const notasActividad =
      ids.length && actividades.length
        ? await tx
            .select({ enrollmentId: activityScores.enrollmentId, activityId: activityScores.activityId, nota: activityScores.nota })
            .from(activityScores)
            .where(inArray(activityScores.activityId, actividades.map((a) => a.id)))
        : [];
    const definitivas = await tx
      .select({
        enrollmentId: grades.enrollmentId,
        nota: grades.nota,
        notaRecuperacion: grades.notaRecuperacion,
        fallas: grades.fallas,
        observacion: grades.observacion,
      })
      .from(grades)
      .where(and(eq(grades.teacherAssignmentId, ctx.assignment.id), eq(grades.periodId, ctx.period.id)));
    const [corte] = await tx
      .select({ id: preventiveCuts.id, realizadoAt: preventiveCuts.realizadoAt })
      .from(preventiveCuts)
      .where(eq(preventiveCuts.periodId, ctx.period.id));
    const notasCorte = corte
      ? await tx
          .select({ enrollmentId: preventiveCutGrades.enrollmentId, nota: preventiveCutGrades.nota })
          .from(preventiveCutGrades)
          .where(and(eq(preventiveCutGrades.cutId, corte.id), eq(preventiveCutGrades.teacherAssignmentId, ctx.assignment.id)))
      : [];

    const porFila = new Map<string, FilaPlanilla>(
      estudiantes.map((e) => [
        e.enrollmentId,
        { enrollmentId: e.enrollmentId, studentId: e.studentId, documento: e.documento, nombre: e.nombre ?? "", notas: {}, nota: null, notaRecuperacion: null, fallas: 0, observacion: "", corte: null },
      ]),
    );
    for (const p of notasActividad) {
      const fila = porFila.get(p.enrollmentId);
      if (fila) fila.notas[p.activityId] = p.nota;
    }
    for (const g of definitivas) {
      const fila = porFila.get(g.enrollmentId);
      if (!fila) continue;
      fila.nota = g.nota;
      fila.notaRecuperacion = g.notaRecuperacion;
      fila.fallas = g.fallas;
      fila.observacion = g.observacion ?? "";
    }
    for (const c of notasCorte) {
      const fila = porFila.get(c.enrollmentId);
      if (fila) fila.corte = c.nota;
    }

    const [{ clases }] = await tx
      .select({ clases: sql<number>`count(*)::int` })
      .from(attendanceSessions)
      .where(and(eq(attendanceSessions.teacherAssignmentId, asignacion.id), eq(attendanceSessions.periodId, ctx.period.id)));

    const ventana = ctx.period.cerrado && (await ventanaRecuperacion(tx, ctx.period.id));
    const modo: ModoPlanilla = !ctx.period.cerrado ? "edicion" : ventana ? "recuperacion" : "lectura";
    const motivoBloqueo =
      modo === "lectura"
        ? `${ctx.period.nombre} está cerrado. Las calificaciones son de solo lectura hasta la ventana de recuperación (cuando empiece el periodo siguiente).`
        : null;

    return {
      asignacion,
      periodo: { ...periodo, cerrado: ctx.period.cerrado, ventanaRecuperacion: ventana },
      escala,
      topeRecuperacion: inst.tope,
      actividades,
      logros,
      filas: [...porFila.values()],
      modo,
      motivoBloqueo,
      corte: corte ? { realizadoAt: corte.realizadoAt.toISOString() } : null,
      fallasDesdeAsistencia: clases > 0,
    };
  });
}
