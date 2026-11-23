import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { withTenant } from "@/db/client";
import { areas, convivenciaGrades, enrollments, gradeLevels, grades, groups, periods, subjects, teacherAssignments, users } from "@/db/schema";
import type { Session } from "@/lib/auth/session";
import { leerAnioActivo } from "@/features/periodos/server/queries";
import { leerEscala } from "@/lib/grading/escala.server";
import type { Escala } from "@/lib/grading/calc";
import { periodoPorDefecto } from "@/features/planilla/server/queries";

export type Consolidado = {
  anio: number;
  grupos: { id: string; codigo: string; grado: string; gradoCodigo: number }[];
  grupo: { id: string; codigo: string; grado: string; gradoCodigo: number } | null;
  periodos: { id: string; nombre: string; numero: number; cerrado: boolean; fechaInicio: string; fechaFin: string }[];
  periodo: { id: string; nombre: string; numero: number; cerrado: boolean } | null;
  asignaturas: { asignacionId: string; nombre: string; abreviatura: string; docente: string }[];
  estudiantes: {
    enrollmentId: string;
    nombre: string;
    documento: string;
    /** asignacionId → nota final (con recuperación) */
    notas: Record<string, number | null>;
    recuperadas: string[];
    convivencia: number | null;
  }[];
  escala: Escala;
};

/**
 * Consolidado (sábana) de un salón en un periodo: estudiantes × asignaturas
 * con la nota final. Funciona igual con el periodo abierto o CERRADO: cerrar
 * un periodo bloquea la edición, no la consulta.
 */
export async function getConsolidado(session: Session, groupId?: string, periodId?: string): Promise<Consolidado | null> {
  return withTenant(session, async (tx) => {
    const anio = await leerAnioActivo(tx, session.institutionId);
    if (!anio) return null;
    const escala = await leerEscala(tx, session.institutionId);

    const grupos = await tx
      .select({ id: groups.id, codigo: groups.codigo, grado: gradeLevels.nombre, gradoCodigo: gradeLevels.codigo })
      .from(groups)
      .innerJoin(gradeLevels, eq(gradeLevels.id, groups.gradeLevelId))
      .where(and(eq(groups.institutionId, session.institutionId), eq(groups.academicYearId, anio.id)))
      .orderBy(asc(gradeLevels.codigo), asc(groups.codigo));
    const grupo = grupos.find((g) => g.id === groupId) ?? grupos[0] ?? null;

    const periodos = await tx
      .select({ id: periods.id, nombre: periods.nombre, numero: periods.numero, cerrado: periods.cerrado, fechaInicio: periods.fechaInicio, fechaFin: periods.fechaFin })
      .from(periods)
      .where(and(eq(periods.institutionId, session.institutionId), eq(periods.academicYearId, anio.id)))
      .orderBy(asc(periods.numero));
    const periodo = periodos.find((p) => p.id === periodId) ?? periodoPorDefecto(periodos) ?? null;

    if (!grupo || !periodo) return { anio: anio.anio, grupos, grupo, periodos, periodo, asignaturas: [], estudiantes: [], escala };

    const docente = users;
    const asignaturas = (
      await tx
        .select({
          asignacionId: teacherAssignments.id,
          nombre: subjects.nombre,
          abreviatura: subjects.abreviatura,
          docente: docente.nombreCompleto,
        })
        .from(teacherAssignments)
        .innerJoin(subjects, eq(subjects.id, teacherAssignments.subjectId))
        .innerJoin(areas, eq(areas.id, subjects.areaId))
        .innerJoin(docente, eq(docente.id, teacherAssignments.teacherId))
        .where(eq(teacherAssignments.groupId, grupo.id))
        .orderBy(asc(areas.orden), asc(subjects.nombre))
    ).map((a) => ({ ...a, docente: a.docente ?? "" }));

    const mats = await tx
      .select({ enrollmentId: enrollments.id, nombre: users.nombreCompleto, documento: users.documentoIdentidad })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.studentId))
      .where(and(eq(enrollments.groupId, grupo.id), eq(enrollments.estado, "ACTIVA")))
      .orderBy(asc(users.nombreCompleto));
    const ids = mats.map((m) => m.enrollmentId);

    const notas = ids.length
      ? await tx
          .select({ enrollmentId: grades.enrollmentId, asignacionId: grades.teacherAssignmentId, nota: grades.notaFinal, recuperacion: grades.notaRecuperacion })
          .from(grades)
          .where(and(eq(grades.periodId, periodo.id), inArray(grades.enrollmentId, ids)))
      : [];
    const conv = ids.length
      ? await tx
          .select({ enrollmentId: convivenciaGrades.enrollmentId, nota: convivenciaGrades.nota })
          .from(convivenciaGrades)
          .where(and(eq(convivenciaGrades.periodId, periodo.id), inArray(convivenciaGrades.enrollmentId, ids)))
      : [];
    const convPor = new Map(conv.map((c) => [c.enrollmentId, c.nota]));

    const estudiantes = mats.map((m) => {
      const propias = notas.filter((n) => n.enrollmentId === m.enrollmentId);
      return {
        enrollmentId: m.enrollmentId,
        nombre: m.nombre ?? "",
        documento: m.documento,
        notas: Object.fromEntries(propias.map((n) => [n.asignacionId, n.nota])),
        recuperadas: propias.filter((n) => n.recuperacion !== null).map((n) => n.asignacionId),
        convivencia: convPor.get(m.enrollmentId) ?? null,
      };
    });

    return { anio: anio.anio, grupos, grupo, periodos, periodo, asignaturas, estudiantes, escala };
  });
}
