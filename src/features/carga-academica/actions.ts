"use server";

import { refresh } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { withTenant, type Tx } from "@/db/client";
import { errorPostgres } from "@/db/errors";
import { groups, subjects, teacherAssignments, users } from "@/db/schema";
import { ROLES_COORDINACION, sessionParaAccion } from "@/lib/auth/session";
import { leerAnioActivo } from "@/features/periodos/server/queries";
import { asignacionSchema, directorSchema, quitarSchema, type EstadoCarga } from "./types";

const SIN_PERMISO: EstadoCarga = { ok: false, error: "Solo coordinación o administración pueden modificar la carga académica." };

class Rechazo extends Error {}

/** El grupo debe ser del colegio y del año activo (la carga de años anteriores no se toca). */
async function grupoDelAnio(tx: Tx, institutionId: string, groupId: string) {
  const anio = await leerAnioActivo(tx, institutionId);
  if (!anio) throw new Rechazo("No hay un año lectivo activo.");
  const [g] = await tx
    .select({ id: groups.id, codigo: groups.codigo })
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.institutionId, institutionId), eq(groups.academicYearId, anio.id)));
  if (!g) throw new Rechazo("El grupo no existe o no es del año lectivo activo.");
  return g;
}

async function docenteValido(tx: Tx, institutionId: string, teacherId: string) {
  const [d] = await tx
    .select({ nombre: users.nombreCompleto })
    .from(users)
    .where(
      and(eq(users.id, teacherId), eq(users.institutionId, institutionId), eq(users.activo, true), inArray(users.rol, ["TEACHER", "COORDINATOR"])),
    );
  if (!d) throw new Rechazo("El docente no existe, está inactivo o su rol no permite dictar clases.");
  return d.nombre ?? "";
}

function mensajeError(err: unknown, contexto: string): EstadoCarga {
  if (err instanceof Rechazo) return { ok: false, error: err.message };
  const pg = errorPostgres(err);
  if (pg?.code === "23514" || pg?.code === "P0001") return { ok: false, error: pg.message };
  console.error(`[carga] ${contexto}`, err);
  return { ok: false, error: "No se pudo guardar. Intente de nuevo." };
}

/** Asigna (o cambia) el docente y la intensidad horaria de una asignatura en un grupo. */
export async function guardarAsignacion(_prev: EstadoCarga, formData: FormData): Promise<EstadoCarga> {
  const session = await sessionParaAccion(ROLES_COORDINACION);
  if (!session) return SIN_PERMISO;
  const parsed = asignacionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    await withTenant(session, async (tx) => {
      await grupoDelAnio(tx, session.institutionId, d.groupId);
      await docenteValido(tx, session.institutionId, d.teacherId);
      const [m] = await tx
        .select({ id: subjects.id })
        .from(subjects)
        .where(and(eq(subjects.id, d.subjectId), eq(subjects.institutionId, session.institutionId), eq(subjects.activo, true)));
      if (!m) throw new Rechazo("La asignatura no existe o está inactiva.");

      await tx
        .insert(teacherAssignments)
        .values({
          institutionId: session.institutionId,
          groupId: d.groupId,
          subjectId: d.subjectId,
          teacherId: d.teacherId,
          intensidadHoraria: d.intensidadHoraria,
        })
        .onConflictDoUpdate({
          target: [teacherAssignments.groupId, teacherAssignments.subjectId],
          set: { teacherId: d.teacherId, intensidadHoraria: d.intensidadHoraria },
        });
    });
    refresh();
    return { ok: true, error: null, mensaje: "Guardado" };
  } catch (err) {
    return mensajeError(err, "guardar");
  }
}

/** Quita una asignación sin calificaciones. Con calificaciones, la FK lo impide: se debe cambiar el docente. */
export async function quitarAsignacion(_prev: EstadoCarga, formData: FormData): Promise<EstadoCarga> {
  const session = await sessionParaAccion(ROLES_COORDINACION);
  if (!session) return SIN_PERMISO;
  const parsed = quitarSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Solicitud inválida. Recargue la página." };

  try {
    await withTenant(session, async (tx) => {
      const [a] = await tx
        .select({ groupId: teacherAssignments.groupId })
        .from(teacherAssignments)
        .where(and(eq(teacherAssignments.id, parsed.data.assignmentId), eq(teacherAssignments.institutionId, session.institutionId)));
      if (!a) throw new Rechazo("La asignación ya no existe.");
      await grupoDelAnio(tx, session.institutionId, a.groupId);
      await tx.delete(teacherAssignments).where(eq(teacherAssignments.id, parsed.data.assignmentId));
    });
    refresh();
    return { ok: true, error: null, mensaje: "Asignación quitada" };
  } catch (err) {
    if (errorPostgres(err)?.code === "23503") {
      return { ok: false, error: "Ya tiene calificaciones registradas: no se puede quitar. Cambie el docente en su lugar." };
    }
    return mensajeError(err, "quitar");
  }
}

/** Director de grupo (puede quedar sin director). */
export async function asignarDirector(_prev: EstadoCarga, formData: FormData): Promise<EstadoCarga> {
  const session = await sessionParaAccion(ROLES_COORDINACION);
  if (!session) return SIN_PERMISO;
  const parsed = directorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Solicitud inválida. Recargue la página." };
  const { groupId, directorId } = parsed.data;

  try {
    await withTenant(session, async (tx) => {
      await grupoDelAnio(tx, session.institutionId, groupId);
      if (directorId) await docenteValido(tx, session.institutionId, directorId);
      await tx.update(groups).set({ directorId }).where(eq(groups.id, groupId));
    });
    refresh();
    return { ok: true, error: null, mensaje: "Director actualizado" };
  } catch (err) {
    return mensajeError(err, "director");
  }
}
