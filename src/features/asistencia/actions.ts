"use server";

import { refresh } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/db/client";
import { errorPostgres } from "@/db/errors";
import { academicYears, attendanceRecords, attendanceSessions, groups, periods, teacherAssignments } from "@/db/schema";
import { ROLES_PLANILLA, sessionParaAccion } from "@/lib/auth/session";

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");

const guardarSchema = z.object({
  assignmentId: z.uuid(),
  fecha,
  horas: z.number().int().min(1, "La clase dura al menos 1 hora.").max(6, "Máximo 6 horas por clase."),
  tema: z.string().trim().max(200).nullable(),
  registros: z
    .array(
      z.object({
        enrollmentId: z.uuid(),
        estado: z.enum(["PRESENTE", "AUSENTE", "TARDE", "EXCUSA"]),
        observacion: z.string().trim().max(300),
      }),
    )
    .min(1)
    .max(80),
});

export type ResultadoAsistencia = { ok: true; mensaje: string } | { ok: false; error: string };

/**
 * Guarda la lista de una clase (crea la sesión si no existe). Las fallas de
 * la planilla se recalculan en la base (trigger) con cada registro.
 */
export async function guardarAsistencia(input: z.input<typeof guardarSchema>): Promise<ResultadoAsistencia> {
  const session = await sessionParaAccion(ROLES_PLANILLA);
  if (!session) return { ok: false, error: "Su rol no permite pasar lista." };
  const parsed = guardarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const r = await withTenant(session, async (tx): Promise<ResultadoAsistencia> => {
      // La asignación debe ser del docente (o cualquiera, para coordinación) y del año activo.
      const [a] = await tx
        .select({ teacherId: teacherAssignments.teacherId, academicYearId: groups.academicYearId })
        .from(teacherAssignments)
        .innerJoin(groups, eq(groups.id, teacherAssignments.groupId))
        .innerJoin(academicYears, and(eq(academicYears.id, groups.academicYearId), eq(academicYears.activo, true)))
        .where(and(eq(teacherAssignments.id, d.assignmentId), eq(teacherAssignments.institutionId, session.institutionId)));
      if (!a) return { ok: false, error: "La clase no existe o no es del año activo." };
      if (session.rol === "TEACHER" && a.teacherId !== session.userId) return { ok: false, error: "Solo puede pasar lista en sus propias clases." };

      const [p] = await tx
        .select({ id: periods.id })
        .from(periods)
        .where(and(eq(periods.academicYearId, a.academicYearId), sql`${d.fecha}::date between ${periods.fechaInicio} and ${periods.fechaFin}`));
      if (!p) return { ok: false, error: "La fecha no está dentro de ningún periodo del año lectivo." };

      const [s] = await tx
        .insert(attendanceSessions)
        .values({
          institutionId: session.institutionId,
          teacherAssignmentId: d.assignmentId,
          periodId: p.id,
          fecha: d.fecha,
          horas: d.horas,
          tema: d.tema || null,
          registradoPor: session.userId,
        })
        .onConflictDoUpdate({
          target: [attendanceSessions.teacherAssignmentId, attendanceSessions.fecha],
          set: { horas: d.horas, tema: d.tema || null },
        })
        .returning({ id: attendanceSessions.id });

      await tx
        .insert(attendanceRecords)
        .values(
          d.registros.map((r) => ({
            institutionId: session.institutionId,
            sessionId: s.id,
            enrollmentId: r.enrollmentId,
            estado: r.estado,
            observacion: r.observacion || null,
          })),
        )
        .onConflictDoUpdate({
          target: [attendanceRecords.sessionId, attendanceRecords.enrollmentId],
          set: { estado: sql`excluded.estado`, observacion: sql`excluded.observacion` },
          setWhere: sql`${attendanceRecords.estado} IS DISTINCT FROM excluded.estado OR ${attendanceRecords.observacion} IS DISTINCT FROM excluded.observacion`,
        });

      const ausentes = d.registros.filter((r) => r.estado === "AUSENTE").length;
      const excusas = d.registros.filter((r) => r.estado === "EXCUSA").length;
      return {
        ok: true,
        mensaje: ausentes + excusas === 0 ? "Lista guardada: todos presentes." : `Lista guardada: ${ausentes} ausente(s), ${excusas} con excusa.`,
      };
    });
    if (r.ok) refresh();
    return r;
  } catch (err) {
    const pg = errorPostgres(err);
    if (pg?.hint === "PERIODO_CERRADO" || pg?.code === "23514" || pg?.hint === "SIN_PERMISO") return { ok: false, error: pg.message };
    console.error("[asistencia] guardar", err);
    return { ok: false, error: "No se pudo guardar la lista. Intente de nuevo." };
  }
}

/** Borra una clase registrada por error (y sus registros); las fallas se recalculan. */
export async function eliminarClase(sessionId: string): Promise<ResultadoAsistencia> {
  const session = await sessionParaAccion(ROLES_PLANILLA);
  if (!session) return { ok: false, error: "Sin permiso." };
  if (!z.uuid().safeParse(sessionId).success) return { ok: false, error: "Clase inválida." };
  try {
    const r = await withTenant(session, async (tx): Promise<ResultadoAsistencia> => {
      const [s] = await tx
        .select({ teacherId: teacherAssignments.teacherId })
        .from(attendanceSessions)
        .innerJoin(teacherAssignments, eq(teacherAssignments.id, attendanceSessions.teacherAssignmentId))
        .where(and(eq(attendanceSessions.id, sessionId), eq(attendanceSessions.institutionId, session.institutionId)));
      if (!s) return { ok: false, error: "La clase no existe." };
      if (session.rol === "TEACHER" && s.teacherId !== session.userId) return { ok: false, error: "Solo puede borrar sus propias clases." };
      // Primero los registros (así el trigger recalcula las fallas con la sesión aún presente).
      await tx.delete(attendanceRecords).where(eq(attendanceRecords.sessionId, sessionId));
      await tx.delete(attendanceSessions).where(eq(attendanceSessions.id, sessionId));
      return { ok: true, mensaje: "Clase eliminada." };
    });
    if (r.ok) refresh();
    return r;
  } catch (err) {
    const pg = errorPostgres(err);
    if (pg?.hint === "PERIODO_CERRADO") return { ok: false, error: pg.message };
    console.error("[asistencia] eliminar", err);
    return { ok: false, error: "No se pudo eliminar la clase." };
  }
}
