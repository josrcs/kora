import "server-only";
import { cache } from "react";
import { sql } from "drizzle-orm";
import { withTenant } from "@/db/client";
import type { Session } from "./session";

export type Encabezado = {
  municipio: string;
  departamento: string;
  dane: string;
  estudiantes: number;
  periodo: { nombre: string; anio: number; cerrado: boolean } | null;
  /** Docente: asignaturas que dicta ("Matemáticas · 12 cursos"). */
  carga: string | null;
};

/** Datos del encabezado de la app (una consulta por petición, compartida entre componentes). */
export const getEncabezado = cache(async (session: Session): Promise<Encabezado> => {
  return withTenant(session, async (tx) => {
    const { rows } = await tx.execute<{
      municipio: string;
      departamento: string;
      dane: string;
      estudiantes: number;
      periodo: string | null;
      anio: number | null;
      cerrado: boolean | null;
      materias: string | null;
      cursos: number;
    }>(sql`
      with anio as (select id, anio from academic_years where institution_id = ${session.institutionId} and activo),
           per as (
             select p.nombre, p.cerrado from periods p join anio a on a.id = p.academic_year_id
              order by (current_date between p.fecha_inicio and p.fecha_fin) desc, (not p.cerrado) desc, p.numero desc limit 1)
      select i.municipio, i.departamento, i.codigo_dane as dane,
             (select count(*)::int from enrollments e join anio a on a.id = e.academic_year_id where e.estado = 'ACTIVA') as estudiantes,
             (select nombre from per) as periodo, (select anio from anio) as anio, (select cerrado from per) as cerrado,
             (select string_agg(distinct s.nombre, ', ') from teacher_assignments ta join subjects s on s.id = ta.subject_id
               join groups g on g.id = ta.group_id join anio a on a.id = g.academic_year_id where ta.teacher_id = ${session.userId}) as materias,
             (select count(distinct ta.group_id)::int from teacher_assignments ta join groups g on g.id = ta.group_id
               join anio a on a.id = g.academic_year_id where ta.teacher_id = ${session.userId}) as cursos
        from institutions i where i.id = ${session.institutionId}`);
    const r = rows[0];
    return {
      municipio: r.municipio,
      departamento: r.departamento,
      dane: r.dane,
      estudiantes: r.estudiantes,
      periodo: r.periodo ? { nombre: r.periodo, anio: r.anio ?? 0, cerrado: !!r.cerrado } : null,
      carga: session.rol === "TEACHER" && r.materias ? `${r.materias.split(", ").length > 3 ? "Titular de grupo" : r.materias} · ${r.cursos} curso${r.cursos === 1 ? "" : "s"}` : null,
    };
  });
});
