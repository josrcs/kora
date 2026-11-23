"use server";

import { refresh } from "next/cache";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/db/client";
import { studentGuardians, studentObserver } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { ipCliente } from "@/lib/http";

export type EstadoAccion = { ok: boolean; error: string | null };

const id = z.uuid();

/**
 * El acudiente firma que conoce la anotación. Es un acto registrado
 * (quién, cuándo, desde qué IP); el trigger de la base vuelve a exigir que
 * sea acudiente del estudiante y la auditoría guarda el cambio.
 */
export async function firmarAnotacion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const session = await getSession();
  if (!session || session.debeCambiarPassword || session.rol !== "GUARDIAN") {
    return { ok: false, error: "Solo el acudiente puede firmar la anotación." };
  }
  const anotacionId = id.safeParse(formData.get("anotacionId"));
  if (!anotacionId.success) return { ok: false, error: "Anotación inválida." };
  const ip = await ipCliente();

  const firmadas = await withTenant(session, (tx) =>
    tx
      .update(studentObserver)
      .set({ acudienteId: session.userId, acudienteConfirmadoAt: sql`now()`, acudienteIp: ip })
      .where(
        and(
          eq(studentObserver.id, anotacionId.data),
          eq(studentObserver.institutionId, session.institutionId),
          isNull(studentObserver.acudienteId),
          // Solo anotaciones de sus acudidos con permiso de consulta.
          sql`exists (select 1 from ${studentGuardians}
                       where ${studentGuardians.studentId} = ${studentObserver.studentId}
                         and ${studentGuardians.guardianId} = ${session.userId}
                         and ${studentGuardians.puedeVerNotas})`,
        ),
      )
      .returning({ id: studentObserver.id }),
  );
  if (firmadas.length === 0) return { ok: false, error: "La anotación ya estaba firmada o no está disponible." };
  refresh();
  return { ok: true, error: null };
}

const descargosSchema = z.object({
  anotacionId: id,
  descargos: z
    .string()
    .trim()
    .min(20, "Escriba sus descargos con al menos 20 caracteres.")
    .max(4000, "Máximo 4000 caracteres."),
});

/** El estudiante presenta su versión de los hechos (una sola vez, no se edita después). */
export async function presentarDescargos(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const session = await getSession();
  if (!session || session.debeCambiarPassword || session.rol !== "STUDENT") {
    return { ok: false, error: "Solo el estudiante puede presentar descargos." };
  }
  const parsed = descargosSchema.safeParse({ anotacionId: formData.get("anotacionId"), descargos: formData.get("descargos") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const guardadas = await withTenant(session, (tx) =>
    tx
      .update(studentObserver)
      .set({ descargos: parsed.data.descargos, descargosAt: sql`now()` })
      .where(
        and(
          eq(studentObserver.id, parsed.data.anotacionId),
          eq(studentObserver.institutionId, session.institutionId),
          eq(studentObserver.studentId, session.userId),
          isNull(studentObserver.descargos),
          ne(studentObserver.tipo, "FELICITACION"),
        ),
      )
      .returning({ id: studentObserver.id }),
  );
  if (guardadas.length === 0) return { ok: false, error: "Ya presentó descargos para esta anotación." };
  refresh();
  return { ok: true, error: null };
}
