import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { withTenant, type Tx } from "@/db/client";
import { academicYears, periodEvents, periods, users } from "@/db/schema";
import type { Session } from "@/lib/auth/session";
import type { AnioGestion, AvanceAsignacion, AvanceTotal, PeriodoGestion } from "../types";

/** "Jaime Alberto Mendoza Polo" (las listas usan nombre_completo: apellidos primero). */
const nombreNatural = sql<string>`${users.nombres} || ' ' || ${users.apellidos}`;

export async function leerAnioActivo(tx: Tx, institutionId: string): Promise<AnioGestion | null> {
  const [anio] = await tx
    .select({ id: academicYears.id, anio: academicYears.anio, fechaInicio: academicYears.fechaInicio, fechaFin: academicYears.fechaFin })
    .from(academicYears)
    .where(and(eq(academicYears.institutionId, institutionId), eq(academicYears.activo, true)));
  return anio ?? null;
}

/**
 * Calificaciones esperadas vs. digitadas por periodo del año (vista
 * v_assignment_progress: asignación × estudiante activo del grupo).
 */
export async function avancePorPeriodo(tx: Tx, institutionId: string, academicYearId: string): Promise<Map<string, AvanceTotal>> {
  const { rows } = await tx.execute<{ period_id: string; celdas: number; con_nota: number }>(sql`
    select v.period_id, sum(v.estudiantes)::int as celdas, sum(v.con_nota)::int as con_nota
      from v_assignment_progress v
      join periods p on p.id = v.period_id
     where v.institution_id = ${institutionId} and p.academic_year_id = ${academicYearId}
     group by v.period_id`);
  return new Map(rows.map((r) => [r.period_id, { celdas: r.celdas, conNota: r.con_nota, pendientes: r.celdas - r.con_nota }]));
}

export async function getPeriodosGestion(session: Session): Promise<{ anio: AnioGestion; periodos: PeriodoGestion[] } | null> {
  return withTenant(session, async (tx) => {
    const anio = await leerAnioActivo(tx, session.institutionId);
    if (!anio) return null;

    const filas = await tx
      .select({ p: periods, cerradoPor: nombreNatural })
      .from(periods)
      .leftJoin(users, eq(users.id, periods.cerradoPor))
      .where(and(eq(periods.institutionId, session.institutionId), eq(periods.academicYearId, anio.id)))
      .orderBy(asc(periods.numero));
    const avance = await avancePorPeriodo(tx, session.institutionId, anio.id);
    const eventos = filas.length
      ? await tx
          .select({
            periodId: periodEvents.periodId,
            accion: periodEvents.accion,
            motivo: periodEvents.motivo,
            pendientes: periodEvents.pendientes,
            actor: nombreNatural,
            fecha: periodEvents.createdAt,
          })
          .from(periodEvents)
          .innerJoin(users, eq(users.id, periodEvents.actorId))
          .where(inArray(periodEvents.periodId, filas.map((f) => f.p.id)))
          .orderBy(desc(periodEvents.createdAt))
      : [];

    return {
      anio,
      periodos: filas.map(({ p, cerradoPor }) => ({
        id: p.id,
        numero: p.numero,
        nombre: p.nombre,
        porcentaje: p.porcentaje,
        fechaInicio: p.fechaInicio,
        fechaFin: p.fechaFin,
        fechaLimiteNotas: p.fechaLimiteNotas,
        cerrado: p.cerrado,
        cerradoAt: p.cerradoAt?.toISOString() ?? null,
        cerradoPor: cerradoPor ?? null,
        avance: avance.get(p.id) ?? { celdas: 0, conNota: 0, pendientes: 0 },
        historial: eventos
          .filter((e) => e.periodId === p.id)
          .map((e) => ({ accion: e.accion, motivo: e.motivo, pendientes: e.pendientes, actor: e.actor ?? "", fecha: e.fecha.toISOString() })),
      })),
    };
  });
}

/** Avance de digitación de cada asignación del año activo en un periodo. */
export async function leerAvanceAsignaciones(tx: Tx, institutionId: string, periodId: string): Promise<AvanceAsignacion[]> {
  const { rows } = await tx.execute<{
    assignment_id: string;
    teacher_id: string;
    docente: string;
    grupo: string;
    grado_codigo: number;
    asignatura: string;
    estudiantes: number;
    con_nota: number;
    ultima_edicion: Date | null;
  }>(sql`
    select ta.id as assignment_id, ta.teacher_id, u.nombre_completo as docente,
           g.codigo as grupo, gl.codigo as grado_codigo, s.nombre as asignatura,
           count(e.id)::int as estudiantes, count(gr.nota)::int as con_nota, max(gr.updated_at) as ultima_edicion
      from periods p
      join groups g               on g.academic_year_id = p.academic_year_id
      join grade_levels gl        on gl.id = g.grade_level_id
      join teacher_assignments ta on ta.group_id = g.id
      join subjects s             on s.id = ta.subject_id
      join users u                on u.id = ta.teacher_id
      left join enrollments e     on e.group_id = g.id and e.estado = 'ACTIVA'
      left join grades gr         on gr.enrollment_id = e.id and gr.teacher_assignment_id = ta.id and gr.period_id = p.id
     where p.id = ${periodId} and p.institution_id = ${institutionId}
     group by ta.id, u.nombre_completo, g.codigo, gl.codigo, s.nombre
     order by u.nombre_completo, gl.codigo, g.codigo, s.nombre`);
  return rows.map((r) => ({
    assignmentId: r.assignment_id,
    teacherId: r.teacher_id,
    docente: r.docente,
    grupo: r.grupo,
    gradoCodigo: r.grado_codigo,
    asignatura: r.asignatura,
    estudiantes: r.estudiantes,
    conNota: r.con_nota,
    pendientes: r.estudiantes - r.con_nota,
    ultimaEdicion: r.ultima_edicion ? new Date(r.ultima_edicion).toISOString() : null,
  }));
}
