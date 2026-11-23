"use server";

import { refresh } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/db/client";
import { errorPostgres } from "@/db/errors";
import { convivenciaGrades, enrollments, groups } from "@/db/schema";
import { sessionParaAccion } from "@/lib/auth/session";
import { leerEscala } from "@/lib/grading/escala.server";
import { errorNota } from "@/lib/grading/calc";

const schema = z.object({
  enrollmentId: z.uuid(),
  periodId: z.uuid(),
  nota: z.number().nullable(),
  observacion: z.string().trim().max(1000).nullable(),
});

export type ResultadoNotaConvivencia = { ok: true } | { ok: false; error: string };

/**
 * Guarda (o borra, si la nota queda vacía) la nota de convivencia de un
 * estudiante en un periodo. Coordinación: cualquier grupo. Docente: solo el
 * grupo que dirige. La base lo vuelve a exigir y rechaza periodos cerrados.
 */
export async function guardarNotaConvivencia(input: z.input<typeof schema>): Promise<ResultadoNotaConvivencia> {
  const session = await sessionParaAccion(["COORDINATOR", "TEACHER"]);
  if (!session) return { ok: false, error: "Su rol no permite registrar notas de convivencia." };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const d = parsed.data;

  try {
    const r = await withTenant(session, async (tx): Promise<ResultadoNotaConvivencia> => {
      const [m] = await tx
        .select({ id: enrollments.id, directorId: groups.directorId })
        .from(enrollments)
        .innerJoin(groups, eq(groups.id, enrollments.groupId))
        .where(and(eq(enrollments.id, d.enrollmentId), eq(enrollments.institutionId, session.institutionId)));
      if (!m) return { ok: false, error: "La matrícula no existe." };
      if (session.rol === "TEACHER" && m.directorId !== session.userId) {
        return { ok: false, error: "Solo el director de grupo registra la nota de convivencia de este grupo." };
      }

      if (d.nota === null) {
        await tx
          .delete(convivenciaGrades)
          .where(and(eq(convivenciaGrades.enrollmentId, d.enrollmentId), eq(convivenciaGrades.periodId, d.periodId)));
        return { ok: true };
      }
      const escala = await leerEscala(tx, session.institutionId);
      const problema = errorNota(d.nota, escala);
      if (problema) return { ok: false, error: problema };

      await tx
        .insert(convivenciaGrades)
        .values({
          institutionId: session.institutionId,
          enrollmentId: d.enrollmentId,
          periodId: d.periodId,
          nota: d.nota,
          observacion: d.observacion || null,
          updatedBy: session.userId,
        })
        .onConflictDoUpdate({
          target: [convivenciaGrades.enrollmentId, convivenciaGrades.periodId],
          set: { nota: d.nota, observacion: d.observacion || null, updatedBy: session.userId },
        });
      return { ok: true };
    });
    if (r.ok) refresh(); // actualiza los indicadores del grupo
    return r;
  } catch (err) {
    const pg = errorPostgres(err);
    if (pg?.hint === "PERIODO_CERRADO" || pg?.code === "23514" || pg?.code === "42501") return { ok: false, error: pg.message };
    console.error("[convivencia] guardar nota", err);
    return { ok: false, error: "No se pudo guardar. Intente de nuevo." };
  }
}
