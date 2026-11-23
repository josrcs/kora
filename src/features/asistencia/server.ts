import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { withTenant } from "@/db/client";
import { attendanceRecords, attendanceSessions, enrollments, users, type EstadoAsistencia } from "@/db/schema";
import type { Session } from "@/lib/auth/session";
import { hoyISO } from "@/lib/fechas";
import type { OpcionAsignacion, OpcionPeriodo } from "@/features/planilla/types";

export type FilaLista = {
  enrollmentId: string;
  nombre: string;
  documento: string;
  estado: EstadoAsistencia;
  observacion: string;
  /** Horas de falla del estudiante en esta asignatura y periodo (antes de esta clase). */
  fallasPeriodo: number;
};

export type ClaseHistorial = { id: string; fecha: string; horas: number; tema: string | null; ausentes: number; tardes: number; excusas: number };

export type ListaAsistencia = {
  fecha: string;
  periodo: OpcionPeriodo | null;
  sesion: { id: string; horas: number; tema: string | null } | null;
  filas: FilaLista[];
  historial: ClaseHistorial[];
  editable: boolean;
  motivoLectura: string | null;
};

export function periodoDeFecha(periodos: OpcionPeriodo[], fecha: string) {
  return periodos.find((p) => p.fechaInicio <= fecha && fecha <= p.fechaFin) ?? null;
}

/** Lista de clase de una asignación en una fecha: estudiantes activos, lo ya registrado y las clases del periodo. */
export async function getListaAsistencia(
  session: Session,
  asignacion: OpcionAsignacion,
  periodos: OpcionPeriodo[],
  fecha: string,
): Promise<ListaAsistencia> {
  const periodo = periodoDeFecha(periodos, fecha);
  const hoy = hoyISO();
  const motivoLectura = !periodo
    ? "La fecha no está dentro de ningún periodo del año lectivo."
    : periodo.cerrado
      ? `${periodo.nombre} está cerrado: la asistencia es de solo lectura.`
      : fecha > hoy
        ? "No se puede pasar lista en una fecha futura."
        : null;

  return withTenant(session, async (tx) => {
    const estudiantes = await tx
      .select({ enrollmentId: enrollments.id, nombre: users.nombreCompleto, documento: users.documentoIdentidad })
      .from(enrollments)
      .innerJoin(users, eq(users.id, enrollments.studentId))
      .where(and(eq(enrollments.groupId, asignacion.groupId), eq(enrollments.estado, "ACTIVA")))
      .orderBy(asc(users.nombreCompleto));

    const [sesion] = await tx
      .select({ id: attendanceSessions.id, horas: attendanceSessions.horas, tema: attendanceSessions.tema })
      .from(attendanceSessions)
      .where(and(eq(attendanceSessions.teacherAssignmentId, asignacion.id), eq(attendanceSessions.fecha, fecha)));

    const registros = sesion
      ? await tx
          .select({ enrollmentId: attendanceRecords.enrollmentId, estado: attendanceRecords.estado, observacion: attendanceRecords.observacion })
          .from(attendanceRecords)
          .where(eq(attendanceRecords.sessionId, sesion.id))
      : [];
    const porMatricula = new Map(registros.map((r) => [r.enrollmentId, r]));

    let historial: ClaseHistorial[] = [];
    const fallas = new Map<string, number>();
    if (periodo) {
      historial = await tx
        .select({
          id: attendanceSessions.id,
          fecha: attendanceSessions.fecha,
          horas: attendanceSessions.horas,
          tema: attendanceSessions.tema,
          ausentes: sql<number>`(select count(*)::int from attendance_records r where r.session_id = ${attendanceSessions.id} and r.estado = 'AUSENTE')`,
          tardes: sql<number>`(select count(*)::int from attendance_records r where r.session_id = ${attendanceSessions.id} and r.estado = 'TARDE')`,
          excusas: sql<number>`(select count(*)::int from attendance_records r where r.session_id = ${attendanceSessions.id} and r.estado = 'EXCUSA')`,
        })
        .from(attendanceSessions)
        .where(and(eq(attendanceSessions.teacherAssignmentId, asignacion.id), eq(attendanceSessions.periodId, periodo.id)))
        .orderBy(desc(attendanceSessions.fecha))
        .limit(60);

      const totales = await tx
        .select({
          enrollmentId: attendanceRecords.enrollmentId,
          horas: sql<number>`coalesce(sum(${attendanceSessions.horas}) filter (where ${attendanceRecords.estado} in ('AUSENTE', 'EXCUSA')), 0)::int`,
        })
        .from(attendanceRecords)
        .innerJoin(attendanceSessions, eq(attendanceSessions.id, attendanceRecords.sessionId))
        .where(
          and(
            eq(attendanceSessions.teacherAssignmentId, asignacion.id),
            eq(attendanceSessions.periodId, periodo.id),
            sesion ? sql`${attendanceSessions.id} <> ${sesion.id}` : undefined,
          ),
        )
        .groupBy(attendanceRecords.enrollmentId);
      for (const t of totales) fallas.set(t.enrollmentId, t.horas);
    }

    return {
      fecha,
      periodo,
      sesion: sesion ?? null,
      filas: estudiantes.map((e) => ({
        enrollmentId: e.enrollmentId,
        nombre: e.nombre ?? "",
        documento: e.documento,
        estado: porMatricula.get(e.enrollmentId)?.estado ?? "PRESENTE",
        observacion: porMatricula.get(e.enrollmentId)?.observacion ?? "",
        fallasPeriodo: fallas.get(e.enrollmentId) ?? 0,
      })),
      historial,
      editable: motivoLectura === null,
      motivoLectura,
    };
  });
}
