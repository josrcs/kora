"use server";

import { refresh } from "next/cache";
import { and, eq, max } from "drizzle-orm";
import { withTenant } from "@/db/client";
import { errorPostgres } from "@/db/errors";
import { activities } from "@/db/schema";
import { ROLES_PLANILLA, sessionParaAccion, type Session } from "@/lib/auth/session";
import { leerEscala } from "@/lib/grading/escala.server";
import { guardarPlanilla, recalcularDefinitivas } from "@/features/planilla/server/guardar";
import { leerActividades, leerContexto, puedeEditar } from "@/features/planilla/server/queries";
import { actividadSchema, editarActividadSchema, guardarSchema, type EstadoActividad, type GuardarResultado } from "@/features/planilla/types";

/**
 * Autoguardado de la planilla. Punto de entrada público: autentica, valida la
 * forma con Zod y la pertenencia en `guardarPlanilla`. No revalida la ruta:
 * la grilla ya tiene el estado y no debe re-renderizarse.
 */
export async function guardarCambiosPlanilla(input: unknown): Promise<GuardarResultado> {
  const session = await sessionParaAccion(ROLES_PLANILLA);
  if (!session) return { ok: false, codigo: "SIN_SESION", error: "Su sesión expiró o su rol no permite calificar. Ingrese de nuevo." };
  const parsed = guardarSchema.safeParse(input);
  if (!parsed.success) return { ok: false, codigo: "VALIDACION", error: "Datos inválidos en la planilla. Recargue la página." };
  return guardarPlanilla(session, parsed.data);
}

/* ------------------------------------------------------------------ */
/*  Actividades del docente                                            */
/* ------------------------------------------------------------------ */
class Rechazo extends Error {}

/** Valida planilla + permiso + periodo abierto, ejecuta y recalcula todas las definitivas. */
async function conPlanilla(
  session: Session,
  assignmentId: string,
  periodId: string,
  fn: (tx: Parameters<Parameters<typeof withTenant>[1]>[0]) => Promise<void>,
): Promise<EstadoActividad> {
  try {
    await withTenant(session, async (tx) => {
      const ctx = await leerContexto(tx, session.institutionId, assignmentId, periodId);
      if (!ctx) throw new Rechazo("La planilla no existe.");
      if (!puedeEditar(session, ctx.assignment.teacherId)) throw new Rechazo("Solo el docente asignado o coordinación pueden modificar esta planilla.");
      if (ctx.period.cerrado) throw new Rechazo(`${ctx.period.nombre} está cerrado: no se pueden cambiar las actividades.`);
      await fn(tx);
      const escala = await leerEscala(tx, session.institutionId);
      await recalcularDefinitivas(tx, session, ctx, escala, await leerActividades(tx, ctx), null);
    });
    refresh();
    return { ok: true, error: null };
  } catch (err) {
    if (err instanceof Rechazo) return { ok: false, error: err.message };
    const pg = errorPostgres(err);
    if (pg?.code === "23505") return { ok: false, error: "Ya existe una actividad con ese nombre en esta planilla." };
    if (pg?.code === "23514" || pg?.code === "P0001") return { ok: false, error: pg.message };
    console.error("[planilla] actividad", err);
    return { ok: false, error: "No se pudo guardar la actividad." };
  }
}

export async function crearActividad(_prev: EstadoActividad, formData: FormData): Promise<EstadoActividad> {
  const session = await sessionParaAccion(ROLES_PLANILLA);
  if (!session) return { ok: false, error: "Su rol no permite crear actividades." };
  const parsed = actividadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  return conPlanilla(session, d.assignmentId, d.periodId, async (tx) => {
    const [{ ultimo }] = await tx
      .select({ ultimo: max(activities.orden) })
      .from(activities)
      .where(and(eq(activities.teacherAssignmentId, d.assignmentId), eq(activities.periodId, d.periodId)));
    await tx.insert(activities).values({
      institutionId: session.institutionId,
      teacherAssignmentId: d.assignmentId,
      periodId: d.periodId,
      nombre: d.nombre,
      porcentaje: d.porcentaje,
      orden: (ultimo ?? 0) + 1,
      createdBy: session.userId,
    });
  });
}

async function actividadDe(session: Session, id: string) {
  return withTenant(session, async (tx) => {
    const [a] = await tx
      .select({ assignmentId: activities.teacherAssignmentId, periodId: activities.periodId })
      .from(activities)
      .where(and(eq(activities.id, id), eq(activities.institutionId, session.institutionId)));
    return a ?? null;
  });
}

export async function editarActividad(_prev: EstadoActividad, formData: FormData): Promise<EstadoActividad> {
  const session = await sessionParaAccion(ROLES_PLANILLA);
  if (!session) return { ok: false, error: "Su rol no permite editar actividades." };
  const parsed = editarActividadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const a = await actividadDe(session, parsed.data.id);
  if (!a) return { ok: false, error: "La actividad ya no existe." };
  return conPlanilla(session, a.assignmentId, a.periodId, async (tx) => {
    await tx.update(activities).set({ nombre: parsed.data.nombre, porcentaje: parsed.data.porcentaje }).where(eq(activities.id, parsed.data.id));
  });
}

/** Elimina la actividad y sus notas (se pide confirmación en la interfaz). */
export async function eliminarActividad(_prev: EstadoActividad, formData: FormData): Promise<EstadoActividad> {
  const session = await sessionParaAccion(ROLES_PLANILLA);
  if (!session) return { ok: false, error: "Su rol no permite eliminar actividades." };
  const id = String(formData.get("id") ?? "");
  const a = /^[0-9a-f-]{36}$/.test(id) ? await actividadDe(session, id) : null;
  if (!a) return { ok: false, error: "La actividad ya no existe." };
  return conPlanilla(session, a.assignmentId, a.periodId, async (tx) => {
    await tx.delete(activities).where(eq(activities.id, id));
  });
}
