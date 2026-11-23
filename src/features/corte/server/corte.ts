import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { withTenant } from "@/db/client";
import { periods, preventiveCuts, users } from "@/db/schema";
import type { Session } from "@/lib/auth/session";
import { leerEscala } from "@/lib/grading/escala.server";
import { leerAnioActivo } from "@/features/periodos/server/queries";
import { periodoPorDefecto } from "@/features/planilla/server/queries";

export type ResumenGrupoCorte = {
  id: string;
  codigo: string;
  gradoCodigo: number;
  grado: string;
  estudiantes: number;
  conBajas: number;
  enRiesgo: number;
};
export type EstudianteCorte = { studentId: string; nombre: string; bajas: { asignatura: string; nota: number | null }[] };

export type Corte = {
  periodos: { id: string; nombre: string; numero: number; cerrado: boolean; fechaCorte: string | null }[];
  periodo: { id: string; nombre: string; numero: number; cerrado: boolean; fechaCorte: string | null };
  corte: { realizadoAt: string; realizadoPor: string } | null;
  aprobatoria: number;
  decimales: 1 | 2;
  grupos: ResumenGrupoCorte[];
  grupo: ResumenGrupoCorte | null;
  estudiantes: EstudianteCorte[];
};

export async function getCorte(session: Session, periodId?: string, groupId?: string): Promise<Corte | null> {
  return withTenant(session, async (tx) => {
    const anio = await leerAnioActivo(tx, session.institutionId);
    if (!anio) return null;
    const escala = await leerEscala(tx, session.institutionId);
    const pers = await tx
      .select({ id: periods.id, nombre: periods.nombre, numero: periods.numero, cerrado: periods.cerrado, fechaCorte: periods.fechaCorte, fechaInicio: periods.fechaInicio, fechaFin: periods.fechaFin })
      .from(periods)
      .where(eq(periods.academicYearId, anio.id))
      .orderBy(asc(periods.numero));
    const p = pers.find((x) => x.id === periodId) ?? periodoPorDefecto(pers);
    if (!p) return null;

    const [c] = await tx
      .select({ id: preventiveCuts.id, realizadoAt: preventiveCuts.realizadoAt, nombres: users.nombres, apellidos: users.apellidos })
      .from(preventiveCuts)
      .innerJoin(users, eq(users.id, preventiveCuts.realizadoPor))
      .where(and(eq(preventiveCuts.periodId, p.id), eq(preventiveCuts.institutionId, session.institutionId)));

    const corteId = c?.id ?? "00000000-0000-0000-0000-000000000000";
    const { rows } = await tx.execute<{ id: string; codigo: string; grado_codigo: number; grado: string; estudiantes: number; con_bajas: number; en_riesgo: number }>(sql`
      select g.id, g.codigo, gl.codigo as grado_codigo, gl.nombre as grado,
             count(e.id)::int as estudiantes,
             count(e.id) filter (where x.bajas >= 1)::int as con_bajas,
             count(e.id) filter (where x.bajas >= 3)::int as en_riesgo
        from groups g
        join grade_levels gl on gl.id = g.grade_level_id
        join enrollments e on e.group_id = g.id and e.estado = 'ACTIVA'
        left join lateral (
          select count(*) filter (where cg.nota < ${escala.aprobatoria}) as bajas
            from preventive_cut_grades cg where cg.cut_id = ${corteId} and cg.enrollment_id = e.id
        ) x on true
       where g.academic_year_id = ${anio.id} and g.institution_id = ${session.institutionId}
       group by g.id, gl.codigo, gl.nombre
       order by gl.codigo, g.codigo`);
    const grupos: ResumenGrupoCorte[] = rows.map((r) => ({
      id: r.id,
      codigo: r.codigo,
      gradoCodigo: r.grado_codigo,
      grado: r.grado,
      estudiantes: r.estudiantes,
      conBajas: r.con_bajas,
      enRiesgo: r.en_riesgo,
    }));
    const grupo = grupos.find((g) => g.id === groupId) ?? null;

    let estudiantes: EstudianteCorte[] = [];
    if (grupo && c) {
      const { rows: det } = await tx.execute<{ student_id: string; nombre: string; asignatura: string; nota: string | null }>(sql`
        select u.id as student_id, u.nombre_completo as nombre, s.nombre as asignatura, cg.nota
          from preventive_cut_grades cg
          join enrollments e on e.id = cg.enrollment_id
          join users u on u.id = e.student_id
          join teacher_assignments ta on ta.id = cg.teacher_assignment_id
          join subjects s on s.id = ta.subject_id
         where cg.cut_id = ${c.id} and e.group_id = ${grupo.id} and cg.nota < ${escala.aprobatoria}
         order by u.apellidos, u.nombres, s.nombre`);
      const porEst = new Map<string, EstudianteCorte>();
      for (const d of det) {
        const e = porEst.get(d.student_id) ?? { studentId: d.student_id, nombre: d.nombre, bajas: [] };
        e.bajas.push({ asignatura: d.asignatura, nota: d.nota === null ? null : Number(d.nota) });
        porEst.set(d.student_id, e);
      }
      estudiantes = [...porEst.values()].sort((a, b) => b.bajas.length - a.bajas.length || a.nombre.localeCompare(b.nombre));
    }

    return {
      periodos: pers.map(({ id, nombre, numero, cerrado, fechaCorte }) => ({ id, nombre, numero, cerrado, fechaCorte })),
      periodo: { id: p.id, nombre: p.nombre, numero: p.numero, cerrado: p.cerrado, fechaCorte: p.fechaCorte },
      corte: c ? { realizadoAt: c.realizadoAt.toISOString(), realizadoPor: `${c.nombres} ${c.apellidos}` } : null,
      aprobatoria: escala.aprobatoria,
      decimales: escala.decimales,
      grupos,
      grupo,
      estudiantes,
    };
  });
}
