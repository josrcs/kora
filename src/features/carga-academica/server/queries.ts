import "server-only";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { withTenant } from "@/db/client";
import { areas, enrollments, gradeLevels, grades, groups, subjects, teacherAssignments, users } from "@/db/schema";
import type { Session } from "@/lib/auth/session";
import { leerAnioActivo } from "@/features/periodos/server/queries";
import type { CargaAcademica, DocenteOpcion, FilaCarga, GrupoCarga, ResumenDocente } from "../types";

/** Carga académica del año activo: grupos, la matriz asignatura→docente del grupo elegido y el total por docente. */
export async function getCargaAcademica(session: Session, groupId?: string): Promise<CargaAcademica | null> {
  return withTenant(session, async (tx) => {
    const anio = await leerAnioActivo(tx, session.institutionId);
    if (!anio) return null;
    const inst = session.institutionId;

    const gruposBase = await tx
      .select({
        id: groups.id,
        codigo: groups.codigo,
        grado: gradeLevels.nombre,
        gradoCodigo: gradeLevels.codigo,
        directorId: groups.directorId,
        estudiantes: count(enrollments.id),
      })
      .from(groups)
      .innerJoin(gradeLevels, eq(gradeLevels.id, groups.gradeLevelId))
      .leftJoin(enrollments, and(eq(enrollments.groupId, groups.id), eq(enrollments.estado, "ACTIVA")))
      .where(and(eq(groups.institutionId, inst), eq(groups.academicYearId, anio.id)))
      .groupBy(groups.id, gradeLevels.nombre, gradeLevels.codigo)
      .orderBy(asc(gradeLevels.codigo), asc(groups.codigo));

    const asignaciones = gruposBase.length
      ? await tx
          .select({
            id: teacherAssignments.id,
            groupId: teacherAssignments.groupId,
            subjectId: teacherAssignments.subjectId,
            teacherId: teacherAssignments.teacherId,
            intensidadHoraria: teacherAssignments.intensidadHoraria,
          })
          .from(teacherAssignments)
          .where(inArray(teacherAssignments.groupId, gruposBase.map((g) => g.id)))
      : [];

    const docentes: DocenteOpcion[] = (
      await tx
        .select({ id: users.id, nombre: users.nombreCompleto, rol: users.rol })
        .from(users)
        .where(and(eq(users.institutionId, inst), eq(users.activo, true), inArray(users.rol, ["TEACHER", "COORDINATOR"])))
        .orderBy(asc(users.apellidos), asc(users.nombres))
    ).map((d) => ({ id: d.id, nombre: d.nombre ?? "", rol: d.rol as DocenteOpcion["rol"] }));

    const materias = await tx
      .select({ id: subjects.id, nombre: subjects.nombre, abreviatura: subjects.abreviatura, area: areas.nombre })
      .from(subjects)
      .innerJoin(areas, eq(areas.id, subjects.areaId))
      .where(and(eq(subjects.institutionId, inst), eq(subjects.activo, true)))
      .orderBy(asc(areas.orden), asc(subjects.nombre));

    const grupos: GrupoCarga[] = gruposBase.map((g) => ({
      ...g,
      asignadas: asignaciones.filter((a) => a.groupId === g.id).length,
    }));
    const grupo = grupos.find((g) => g.id === groupId) ?? grupos[0] ?? null;

    let filas: FilaCarga[] = [];
    if (grupo) {
      const delGrupo = asignaciones.filter((a) => a.groupId === grupo.id);
      const conteo = delGrupo.length
        ? await tx
            .select({ assignmentId: grades.teacherAssignmentId, n: count() })
            .from(grades)
            .where(inArray(grades.teacherAssignmentId, delGrupo.map((a) => a.id)))
            .groupBy(grades.teacherAssignmentId)
        : [];
      filas = materias.map((m) => {
        const a = delGrupo.find((x) => x.subjectId === m.id);
        return {
          subjectId: m.id,
          asignatura: m.nombre,
          abreviatura: m.abreviatura,
          area: m.area,
          assignmentId: a?.id ?? null,
          teacherId: a?.teacherId ?? null,
          intensidadHoraria: a?.intensidadHoraria ?? null,
          calificaciones: a ? (conteo.find((c) => c.assignmentId === a.id)?.n ?? 0) : 0,
        };
      });
    }

    const codigoGrupo = new Map(grupos.map((g) => [g.id, g.codigo]));
    const resumen: ResumenDocente[] = docentes
      .map((d) => {
        const suyas = asignaciones.filter((a) => a.teacherId === d.id);
        return {
          id: d.id,
          nombre: d.nombre,
          horas: suyas.reduce((s, a) => s + a.intensidadHoraria, 0),
          asignaciones: suyas.length,
          grupos: [...new Set(suyas.map((a) => codigoGrupo.get(a.groupId) ?? ""))],
          esDirectorDe: grupos.filter((g) => g.directorId === d.id).map((g) => g.codigo),
        };
      })
      .sort((a, b) => b.horas - a.horas || a.nombre.localeCompare(b.nombre));

    return { anio: anio.anio, grupos, docentes, totalAsignaturas: materias.length, grupo, filas, resumen };
  });
}
