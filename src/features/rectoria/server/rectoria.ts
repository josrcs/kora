import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { withTenant } from "@/db/client";
import { enrollments, gradeLevels, grades, groups, periods, teacherAssignments, users } from "@/db/schema";
import type { Session } from "@/lib/auth/session";
import { calcularDefinitiva, redondear, reprueba } from "@/lib/grading/calc";
import { leerEscala } from "@/lib/grading/escala.server";
import { leerAnioActivo } from "@/features/periodos/server/queries";

export type CursoRectoria = {
  id: string;
  codigo: string;
  grado: string;
  gradoCodigo: number;
  director: string | null;
  estudiantes: number;
  /** Promedio de las notas del grupo en cada periodo (null si no hay notas). */
  porPeriodo: Record<string, number | null>;
  /** Promedio de los acumulados del año (estudiante × asignatura), mismo cálculo del boletín. */
  acumulado: number | null;
  /** Estudiantes con 3+ asignaturas en desempeño bajo en el acumulado. */
  enRiesgo: number;
  anotaciones: number;
  procesosAbiertos: number;
};

export type Rectoria = {
  anio: number;
  aprobatoria: number;
  decimales: 1 | 2;
  periodos: { id: string; nombre: string; cerrado: boolean }[];
  cursos: CursoRectoria[];
  /** Promedio acumulado por grado (11 barras en vez de 44). */
  grados: { codigo: number; nombre: string; acumulado: number | null; estudiantes: number }[];
  institucion: { porPeriodo: Record<string, number | null>; acumulado: number | null; estudiantes: number; enRiesgo: number; procesosAbiertos: number };
};

const promedio = (xs: number[], decimales: 1 | 2) =>
  xs.length ? redondear(xs.reduce((s, n) => s + Math.round(n * 100), 0) / xs.length / 100, decimales) : null;

export async function getRectoria(session: Session): Promise<Rectoria | null> {
  return withTenant(session, async (tx) => {
    const anio = await leerAnioActivo(tx, session.institutionId);
    if (!anio) return null;
    const escala = await leerEscala(tx, session.institutionId);
    const pers = await tx
      .select({ id: periods.id, nombre: periods.nombre, cerrado: periods.cerrado, porcentaje: periods.porcentaje })
      .from(periods)
      .where(eq(periods.academicYearId, anio.id))
      .orderBy(asc(periods.numero));

    const cursos = await tx
      .select({
        id: groups.id,
        codigo: groups.codigo,
        grado: gradeLevels.nombre,
        gradoCodigo: gradeLevels.codigo,
        directorNombres: users.nombres,
        directorApellidos: users.apellidos,
        estudiantes: sql<number>`(select count(*)::int from enrollments e where e.group_id = groups.id and e.estado = 'ACTIVA')`,
        anotaciones: sql<number>`(select count(*)::int from student_observer o join enrollments e on e.id = o.enrollment_id where e.group_id = groups.id)`,
        procesosAbiertos: sql<number>`(select count(*)::int from student_observer o join enrollments e on e.id = o.enrollment_id where e.group_id = groups.id and o.proceso = 'ABIERTO')`,
      })
      .from(groups)
      .innerJoin(gradeLevels, eq(gradeLevels.id, groups.gradeLevelId))
      .leftJoin(users, eq(users.id, groups.directorId))
      .where(and(eq(groups.institutionId, session.institutionId), eq(groups.academicYearId, anio.id)))
      .orderBy(asc(gradeLevels.codigo), asc(groups.codigo));

    const notas = await tx
      .select({
        groupId: enrollments.groupId,
        studentId: enrollments.studentId,
        assignmentId: grades.teacherAssignmentId,
        periodId: grades.periodId,
        nota: grades.notaFinal,
      })
      .from(grades)
      .innerJoin(enrollments, eq(enrollments.id, grades.enrollmentId))
      .innerJoin(teacherAssignments, eq(teacherAssignments.id, grades.teacherAssignmentId))
      .where(and(eq(grades.institutionId, session.institutionId), eq(enrollments.academicYearId, anio.id), eq(enrollments.estado, "ACTIVA")));

    const pesos = pers.map((p) => ({ id: p.id, porcentaje: p.porcentaje }));
    const conNota = notas.filter((n): n is typeof n & { nota: number } => n.nota !== null);

    // Acumulado por estudiante × asignatura.
    const porEstAsig = new Map<string, { groupId: string; studentId: string; notas: Record<string, number> }>();
    for (const n of conNota) {
      const k = `${n.studentId}|${n.assignmentId}`;
      const e = porEstAsig.get(k) ?? { groupId: n.groupId, studentId: n.studentId, notas: {} };
      e.notas[n.periodId] = n.nota;
      porEstAsig.set(k, e);
    }
    const acumulados = [...porEstAsig.values()].map((e) => ({ ...e, valor: calcularDefinitiva(pesos, e.notas, escala.decimales).parcial }));
    const bajasPorEstudiante = new Map<string, number>();
    for (const a of acumulados) {
      if (reprueba(a.valor, escala)) bajasPorEstudiante.set(a.studentId, (bajasPorEstudiante.get(a.studentId) ?? 0) + 1);
    }
    const riesgo = new Set([...bajasPorEstudiante].filter(([, n]) => n >= 3).map(([id]) => id));
    const grupoDe = new Map(acumulados.map((a) => [a.studentId, a.groupId]));

    const resultado: CursoRectoria[] = cursos.map((c) => {
      const delCurso = conNota.filter((n) => n.groupId === c.id);
      return {
        id: c.id,
        codigo: c.codigo,
        grado: c.grado,
        gradoCodigo: c.gradoCodigo,
        director: c.directorNombres ? `${c.directorNombres} ${c.directorApellidos}` : null,
        estudiantes: c.estudiantes,
        porPeriodo: Object.fromEntries(pers.map((p) => [p.id, promedio(delCurso.filter((n) => n.periodId === p.id).map((n) => n.nota), escala.decimales)])),
        acumulado: promedio(
          acumulados.filter((a) => a.groupId === c.id && a.valor !== null).map((a) => a.valor!),
          escala.decimales,
        ),
        enRiesgo: [...riesgo].filter((id) => grupoDe.get(id) === c.id).length,
        anotaciones: c.anotaciones,
        procesosAbiertos: c.procesosAbiertos,
      };
    });

    return {
      anio: anio.anio,
      aprobatoria: escala.aprobatoria,
      decimales: escala.decimales,
      periodos: pers.map(({ id, nombre, cerrado }) => ({ id, nombre, cerrado })),
      cursos: resultado,
      grados: [...new Map(cursos.map((c) => [c.gradoCodigo, c.grado])).entries()].map(([codigo, nombre]) => {
        const ids = new Set(cursos.filter((c) => c.gradoCodigo === codigo).map((c) => c.id));
        return {
          codigo,
          nombre,
          acumulado: promedio(acumulados.filter((a) => ids.has(a.groupId) && a.valor !== null).map((a) => a.valor!), escala.decimales),
          estudiantes: resultado.filter((c) => ids.has(c.id)).reduce((s, c) => s + c.estudiantes, 0),
        };
      }),
      institucion: {
        porPeriodo: Object.fromEntries(pers.map((p) => [p.id, promedio(conNota.filter((n) => n.periodId === p.id).map((n) => n.nota), escala.decimales)])),
        acumulado: promedio(acumulados.filter((a) => a.valor !== null).map((a) => a.valor!), escala.decimales),
        estudiantes: resultado.reduce((s, c) => s + c.estudiantes, 0),
        enRiesgo: riesgo.size,
        procesosAbiertos: resultado.reduce((s, c) => s + c.procesosAbiertos, 0),
      },
    };
  });
}
