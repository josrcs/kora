"use server";

import { refresh } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { withTenant } from "@/db/client";
import { errorPostgres } from "@/db/errors";
import { enrollments, studentObserver, teacherAssignments } from "@/db/schema";
import { ROLES_ANOTACIONES, ROLES_PROCESOS, sessionParaAccion } from "@/lib/auth/session";
import { hoyISO } from "@/lib/fechas";
import { leerAnioActivo } from "@/features/periodos/server/queries";
import { anotacionSchema, cerrarProcesoSchema, type EstadoConvivencia } from "./types";

function fallo(err: unknown, contexto: string): EstadoConvivencia {
  const pg = errorPostgres(err);
  if (pg?.code === "23514") return { ok: false, error: pg.message };
  console.error(`[convivencia] ${contexto}`, err);
  return { ok: false, error: "No se pudo guardar. Intente de nuevo." };
}

/**
 * Registra una anotación en el observador del estudiante (año activo).
 * Rectoría y coordinación anotan sobre cualquier estudiante; el docente,
 * solo sobre estudiantes de grupos donde tiene asignaturas. Solo
 * coordinación abre un proceso disciplinario (la base lo exige también).
 */
export async function crearAnotacion(_prev: EstadoConvivencia, formData: FormData): Promise<EstadoConvivencia> {
  const session = await sessionParaAccion(ROLES_ANOTACIONES);
  if (!session) return { ok: false, error: "Su rol no permite registrar anotaciones." };
  const parsed = anotacionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.abrirProceso && !(ROLES_PROCESOS as readonly string[]).includes(session.rol)) {
    return { ok: false, error: "Solo coordinación puede abrir un proceso disciplinario." };
  }
  if (d.fecha > hoyISO()) return { ok: false, error: "La fecha no puede ser futura." };

  try {
    const r = await withTenant(session, async (tx) => {
      const anio = await leerAnioActivo(tx, session.institutionId);
      if (!anio) return { ok: false, error: "No hay un año lectivo activo." };
      const [m] = await tx
        .select({ id: enrollments.id, groupId: enrollments.groupId })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.studentId, d.studentId),
            eq(enrollments.institutionId, session.institutionId),
            eq(enrollments.academicYearId, anio.id),
            eq(enrollments.estado, "ACTIVA"),
          ),
        );
      if (!m) return { ok: false, error: "El estudiante no tiene matrícula activa este año." };
      if (session.rol === "TEACHER") {
        const [dicta] = await tx
          .select({ id: teacherAssignments.id })
          .from(teacherAssignments)
          .where(and(eq(teacherAssignments.groupId, m.groupId), eq(teacherAssignments.teacherId, session.userId)))
          .limit(1);
        if (!dicta) return { ok: false, error: "Solo puede registrar anotaciones de estudiantes de sus grupos." };
      }
      await tx.insert(studentObserver).values({
        institutionId: session.institutionId,
        studentId: d.studentId,
        enrollmentId: m.id,
        autorId: session.userId,
        fecha: d.fecha,
        tipo: d.tipo,
        situacion: d.situacion,
        descripcion: d.descripcion,
        accionPedagogica: d.accionPedagogica,
        proceso: d.abrirProceso ? "ABIERTO" : null,
      });
      return { ok: true, error: null, mensaje: d.abrirProceso ? "Anotación registrada y proceso disciplinario abierto." : "Anotación registrada." };
    });
    if (r.ok) refresh();
    return r;
  } catch (err) {
    return fallo(err, "crear");
  }
}

/** Cierra un proceso disciplinario con su conclusión (solo coordinación / administración). */
export async function cerrarProceso(_prev: EstadoConvivencia, formData: FormData): Promise<EstadoConvivencia> {
  const session = await sessionParaAccion(ROLES_PROCESOS);
  if (!session) return { ok: false, error: "Solo coordinación puede cerrar procesos disciplinarios." };
  const parsed = cerrarProcesoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const n = await withTenant(session, (tx) =>
      tx
        .update(studentObserver)
        .set({ proceso: "CERRADO", conclusion: parsed.data.conclusion, cerradoAt: sql`now()`, cerradoPor: session.userId })
        .where(
          and(
            eq(studentObserver.id, parsed.data.id),
            eq(studentObserver.institutionId, session.institutionId),
            eq(studentObserver.proceso, "ABIERTO"),
          ),
        )
        .returning({ id: studentObserver.id }),
    );
    if (!n.length) return { ok: false, error: "El proceso ya estaba cerrado o no existe." };
    refresh();
    return { ok: true, error: null, mensaje: "Proceso cerrado." };
  } catch (err) {
    return fallo(err, "cerrar");
  }
}
