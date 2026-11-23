import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { withTenant } from "@/db/client";
import { enrollments, gradeLevels, groups, studentObserver, users } from "@/db/schema";
import type { Session } from "@/lib/auth/session";
import { leerAnioActivo } from "@/features/periodos/server/queries";
import type { AnotacionConvivencia } from "../types";

export type GrupoConvivencia = { id: string; codigo: string; grado: string; gradoCodigo: number; procesosAbiertos: number };
export type EstudianteConvivencia = { id: string; nombre: string; documento: string; anotaciones: number; procesosAbiertos: number };
export type ProcesoAbierto = { id: string; studentId: string; groupId: string; estudiante: string; grupo: string; fecha: string; tipo: string; situacion: string | null };

export type Convivencia = {
  anio: number;
  grupos: GrupoConvivencia[];
  grupo: GrupoConvivencia | null;
  estudiantes: EstudianteConvivencia[];
  estudiante: EstudianteConvivencia | null;
  anotaciones: AnotacionConvivencia[];
  procesosAbiertos: ProcesoAbierto[];
};

/** Observador del año activo: grupos, estudiantes del grupo y anotaciones del estudiante elegido. */
export async function getConvivencia(session: Session, groupId?: string, studentId?: string): Promise<Convivencia | null> {
  return withTenant(session, async (tx) => {
    const anio = await leerAnioActivo(tx, session.institutionId);
    if (!anio) return null;
    const inst = session.institutionId;

    const procesosAbiertos = (
      await tx
        .select({
          id: studentObserver.id,
          studentId: studentObserver.studentId,
          groupId: groups.id,
          estudiante: users.nombreCompleto,
          grupo: groups.codigo,
          fecha: studentObserver.fecha,
          tipo: studentObserver.tipo,
          situacion: studentObserver.situacion,
        })
        .from(studentObserver)
        .innerJoin(enrollments, eq(enrollments.id, studentObserver.enrollmentId))
        .innerJoin(groups, eq(groups.id, enrollments.groupId))
        .innerJoin(users, eq(users.id, studentObserver.studentId))
        .where(and(eq(studentObserver.institutionId, inst), eq(studentObserver.proceso, "ABIERTO"), eq(enrollments.academicYearId, anio.id)))
        .orderBy(asc(studentObserver.fecha))
    ).map((p) => ({ ...p, estudiante: p.estudiante ?? "" }));

    const grupos = (
      await tx
        .select({ id: groups.id, codigo: groups.codigo, grado: gradeLevels.nombre, gradoCodigo: gradeLevels.codigo })
        .from(groups)
        .innerJoin(gradeLevels, eq(gradeLevels.id, groups.gradeLevelId))
        .where(and(eq(groups.institutionId, inst), eq(groups.academicYearId, anio.id)))
        .orderBy(asc(gradeLevels.codigo), asc(groups.codigo))
    ).map((g) => ({ ...g, procesosAbiertos: procesosAbiertos.filter((p) => p.groupId === g.id).length }));

    const grupo = grupos.find((g) => g.id === groupId) ?? grupos[0] ?? null;
    if (!grupo) return { anio: anio.anio, grupos, grupo: null, estudiantes: [], estudiante: null, anotaciones: [], procesosAbiertos };

    const estudiantes = (
      await tx
        .select({
          id: users.id,
          nombre: users.nombreCompleto,
          documento: users.documentoIdentidad,
          anotaciones: sql<number>`(select count(*)::int from student_observer o where o.enrollment_id = enrollments.id)`,
          procesosAbiertos: sql<number>`(select count(*)::int from student_observer o where o.enrollment_id = enrollments.id and o.proceso = 'ABIERTO')`,
        })
        .from(enrollments)
        .innerJoin(users, eq(users.id, enrollments.studentId))
        .where(and(eq(enrollments.groupId, grupo.id), eq(enrollments.estado, "ACTIVA")))
        .orderBy(asc(users.apellidos), asc(users.nombres))
    ).map((e) => ({ ...e, nombre: e.nombre ?? "" }));

    const estudiante = estudiantes.find((e) => e.id === studentId) ?? null;
    let anotaciones: AnotacionConvivencia[] = [];
    if (estudiante) {
      const autor = alias(users, "autor");
      const acudiente = alias(users, "acudiente");
      const cierre = alias(users, "cierre");
      const rows = await tx
        .select({
          o: studentObserver,
          autorNombres: autor.nombres,
          autorApellidos: autor.apellidos,
          autorRol: autor.rol,
          acudiente: acudiente.nombreCompleto,
          cerradoPor: cierre.nombreCompleto,
        })
        .from(studentObserver)
        .innerJoin(autor, eq(autor.id, studentObserver.autorId))
        .leftJoin(acudiente, eq(acudiente.id, studentObserver.acudienteId))
        .leftJoin(cierre, eq(cierre.id, studentObserver.cerradoPor))
        .where(and(eq(studentObserver.institutionId, inst), eq(studentObserver.studentId, estudiante.id)))
        .orderBy(desc(studentObserver.fecha), desc(studentObserver.createdAt));
      anotaciones = rows.map(({ o, ...r }) => ({
        id: o.id,
        fecha: o.fecha,
        tipo: o.tipo,
        situacion: o.situacion,
        descripcion: o.descripcion,
        accionPedagogica: o.accionPedagogica,
        autor: `${r.autorNombres} ${r.autorApellidos}`,
        autorRol: r.autorRol,
        descargos: o.descargos,
        firmadaPor: r.acudiente ?? null,
        firmadaAt: o.acudienteConfirmadoAt?.toISOString() ?? null,
        proceso: o.proceso,
        conclusion: o.conclusion,
        cerradoPor: r.cerradoPor ?? null,
        cerradoAt: o.cerradoAt?.toISOString() ?? null,
      }));
    }

    return { anio: anio.anio, grupos, grupo, estudiantes, estudiante, anotaciones, procesosAbiertos };
  });
}
