import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { withTenant } from "@/db/client";
import { academicYears } from "@/db/schema";
import type { Session } from "@/lib/auth/session";

export type PeriodoAdmin = {
  id: string;
  numero: number;
  nombre: string;
  porcentaje: number;
  fechaInicio: string;
  fechaFin: string;
  fechaLimiteNotas: string | null;
  cerrado: boolean;
  calificaciones: number;
};

export type AnioAdmin = {
  id: string;
  anio: number;
  fechaInicio: string | null;
  fechaFin: string | null;
  activo: boolean;
  grupos: number;
  matriculas: number;
  periodos: PeriodoAdmin[];
};

export async function getAnios(session: Session): Promise<AnioAdmin[]> {
  return withTenant(session, async (tx) => {
    const anios = await tx
      .select({
        id: academicYears.id,
        anio: academicYears.anio,
        fechaInicio: academicYears.fechaInicio,
        fechaFin: academicYears.fechaFin,
        activo: academicYears.activo,
        // Calificado a mano: Drizzle escribe ${academicYears.id} como "id" a secas en consultas de una tabla,
        // y dentro de la subconsulta "id" sería el de groups/enrollments.
        grupos: sql<number>`(select count(*)::int from groups g where g.academic_year_id = academic_years.id)`,
        matriculas: sql<number>`(select count(*)::int from enrollments e where e.academic_year_id = academic_years.id and e.estado = 'ACTIVA')`,
      })
      .from(academicYears)
      .where(eq(academicYears.institutionId, session.institutionId))
      .orderBy(desc(academicYears.anio));

    const { rows } = await tx.execute<{
      id: string;
      academic_year_id: string;
      numero: number;
      nombre: string;
      porcentaje: string;
      fecha_inicio: string;
      fecha_fin: string;
      fecha_limite_notas: string | null;
      cerrado: boolean;
      calificaciones: number;
    }>(sql`
      select p.id, p.academic_year_id, p.numero, p.nombre, p.porcentaje, p.fecha_inicio::text, p.fecha_fin::text,
             p.fecha_limite_notas::text, p.cerrado,
             (select count(*)::int from grades g where g.period_id = p.id) as calificaciones
        from periods p
       where p.institution_id = ${session.institutionId}
       order by p.numero`);

    return anios.map((a) => ({
      ...a,
      periodos: rows
        .filter((p) => p.academic_year_id === a.id)
        .map((p) => ({
          id: p.id,
          numero: p.numero,
          nombre: p.nombre,
          porcentaje: Number(p.porcentaje),
          fechaInicio: p.fecha_inicio,
          fechaFin: p.fecha_fin,
          fechaLimiteNotas: p.fecha_limite_notas,
          cerrado: p.cerrado,
          calificaciones: p.calificaciones,
        })),
    }));
  });
}

/** Años del colegio (para selectores), el activo primero. */
export async function opcionesAnios(session: Session) {
  return withTenant(session, (tx) =>
    tx
      .select({ id: academicYears.id, anio: academicYears.anio, activo: academicYears.activo })
      .from(academicYears)
      .where(and(eq(academicYears.institutionId, session.institutionId)))
      .orderBy(desc(academicYears.activo), desc(academicYears.anio)),
  );
}
