"use server";

import { refresh } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { withTenant, type Tx } from "@/db/client";
import { errorPostgres } from "@/db/errors";
import { periodEvents, periods } from "@/db/schema";
import { ROLES_COORDINACION, sessionParaAccion } from "@/lib/auth/session";
import { cerrarSchema, fechasSchema, reabrirSchema, type EstadoAccion } from "./types";
import { avancePorPeriodo, leerAnioActivo } from "./server/queries";

const SIN_PERMISO: EstadoAccion = { ok: false, error: "Solo coordinación o administración pueden gestionar periodos." };

/** Bloquea la fila del periodo (FOR UPDATE) para que dos coordinadores no lo cierren/reabran a la vez. */
async function periodoBloqueado(tx: Tx, institutionId: string, periodId: string) {
  const anio = await leerAnioActivo(tx, institutionId);
  if (!anio) return null;
  const [p] = await tx
    .select()
    .from(periods)
    .where(and(eq(periods.id, periodId), eq(periods.institutionId, institutionId), eq(periods.academicYearId, anio.id)))
    .for("update");
  return p ? { periodo: p, anio } : null;
}

class Rechazo extends Error {}

function mensajeError(err: unknown, contexto: string): EstadoAccion {
  if (err instanceof Rechazo) return { ok: false, error: err.message };
  const pg = errorPostgres(err);
  if (pg?.hint === "CIERRE_FUERA_DE_ORDEN") return { ok: false, error: `${pg.message}: los periodos se cierran en orden.` };
  if (pg?.code === "23P01") return { ok: false, error: "Las fechas se cruzan con las de otro periodo del año." };
  if (pg?.code === "23514") return { ok: false, error: pg.message };
  console.error(`[periodos] ${contexto}`, err);
  return { ok: false, error: "No se pudo completar la operación. Intente de nuevo." };
}

/**
 * Cierra un periodo: bloquea la digitación y PUBLICA el boletín a
 * estudiantes y acudientes. Si faltan calificaciones exige confirmarlo
 * explícitamente, y el número queda en el historial.
 */
export async function cerrarPeriodo(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const session = await sessionParaAccion(ROLES_COORDINACION);
  if (!session) return SIN_PERMISO;
  const parsed = cerrarSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Solicitud inválida. Recargue la página." };
  const { periodId, pendientesVistos, confirmarPendientes } = parsed.data;

  try {
    const nombre = await withTenant(session, async (tx) => {
      const ctx = await periodoBloqueado(tx, session.institutionId, periodId);
      if (!ctx) throw new Rechazo("El periodo no existe o no es del año lectivo activo.");
      if (ctx.periodo.cerrado) throw new Rechazo(`${ctx.periodo.nombre} ya estaba cerrado.`);

      const pendientes = (await avancePorPeriodo(tx, session.institutionId, ctx.anio.id)).get(periodId)?.pendientes ?? 0;
      if (pendientes > 0 && (!confirmarPendientes || pendientes !== pendientesVistos)) {
        throw new Rechazo(
          pendientes !== pendientesVistos
            ? `Ahora faltan ${pendientes} calificaciones (antes ${pendientesVistos}). Revise y confirme de nuevo.`
            : `Faltan ${pendientes} calificaciones. Marque la confirmación para cerrar de todos modos.`,
        );
      }

      await tx
        .update(periods)
        .set({ cerrado: true, cerradoAt: sql`now()`, cerradoPor: session.userId })
        .where(eq(periods.id, periodId));
      await tx.insert(periodEvents).values({
        institutionId: session.institutionId,
        periodId,
        accion: "CIERRE",
        pendientes,
        actorId: session.userId,
      });
      return ctx.periodo.nombre;
    });
    refresh();
    return { ok: true, error: null, mensaje: `${nombre} cerrado. Los boletines ya están disponibles en el portal.` };
  } catch (err) {
    return mensajeError(err, "cerrar");
  }
}

/** Reabre un periodo cerrado (para correcciones). Retira su boletín del portal hasta que se vuelva a cerrar. */
export async function reabrirPeriodo(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const session = await sessionParaAccion(ROLES_COORDINACION);
  if (!session) return SIN_PERMISO;
  const parsed = reabrirSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { periodId, motivo } = parsed.data;

  try {
    const nombre = await withTenant(session, async (tx) => {
      const ctx = await periodoBloqueado(tx, session.institutionId, periodId);
      if (!ctx) throw new Rechazo("El periodo no existe o no es del año lectivo activo.");
      if (!ctx.periodo.cerrado) throw new Rechazo(`${ctx.periodo.nombre} ya estaba abierto.`);

      await tx.update(periods).set({ cerrado: false, cerradoAt: null, cerradoPor: null }).where(eq(periods.id, periodId));
      await tx.insert(periodEvents).values({
        institutionId: session.institutionId,
        periodId,
        accion: "REAPERTURA",
        motivo,
        actorId: session.userId,
      });
      return ctx.periodo.nombre;
    });
    refresh();
    return { ok: true, error: null, mensaje: `${nombre} reabierto. Los docentes ya pueden corregir sus planillas.` };
  } catch (err) {
    return mensajeError(err, "reabrir");
  }
}

/** Fechas del periodo y plazo de entrega de notas. Solo en periodos abiertos. */
export async function actualizarFechas(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const session = await sessionParaAccion(ROLES_COORDINACION);
  if (!session) return SIN_PERMISO;
  const parsed = fechasSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    await withTenant(session, async (tx) => {
      const ctx = await periodoBloqueado(tx, session.institutionId, d.periodId);
      if (!ctx) throw new Rechazo("El periodo no existe o no es del año lectivo activo.");
      if (ctx.periodo.cerrado) throw new Rechazo("Un periodo cerrado no se puede modificar. Reábralo primero.");
      const { fechaInicio: ini, fechaFin: fin } = ctx.anio;
      if ((ini && d.fechaInicio < ini) || (fin && d.fechaFin > fin)) {
        throw new Rechazo(`Las fechas deben estar dentro del año lectivo ${ctx.anio.anio}.`);
      }
      await tx
        .update(periods)
        .set({ fechaInicio: d.fechaInicio, fechaFin: d.fechaFin, fechaLimiteNotas: d.fechaLimiteNotas })
        .where(eq(periods.id, d.periodId));
    });
    refresh();
    return { ok: true, error: null, mensaje: "Fechas actualizadas." };
  } catch (err) {
    return mensajeError(err, "fechas");
  }
}
