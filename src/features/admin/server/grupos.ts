import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { withTenant } from "@/db/client";
import { academicYears, gradeLevels, groups, users } from "@/db/schema";
import type { Session } from "@/lib/auth/session";

export type GrupoAdmin = {
  id: string;
  codigo: string;
  gradeLevelId: string;
  grado: string;
  gradoCodigo: number;
  jornada: string;
  capacidad: number | null;
  director: string | null;
  matriculados: number;
  asignaciones: number;
};

export type GruposAdmin = {
  anios: { id: string; anio: number; activo: boolean }[];
  anio: { id: string; anio: number; activo: boolean } | null;
  grados: { id: string; nombre: string; codigo: number }[];
  grupos: GrupoAdmin[];
};

export async function getGrupos(session: Session, anioId?: string): Promise<GruposAdmin> {
  return withTenant(session, async (tx) => {
    const anios = await tx
      .select({ id: academicYears.id, anio: academicYears.anio, activo: academicYears.activo })
      .from(academicYears)
      .where(eq(academicYears.institutionId, session.institutionId))
      .orderBy(desc(academicYears.anio));
    const anio = anios.find((a) => a.id === anioId) ?? anios.find((a) => a.activo) ?? anios[0] ?? null;

    const grados = await tx
      .select({ id: gradeLevels.id, nombre: gradeLevels.nombre, codigo: gradeLevels.codigo })
      .from(gradeLevels)
      .where(eq(gradeLevels.institutionId, session.institutionId))
      .orderBy(asc(gradeLevels.codigo));

    const lista = anio
      ? await tx
          .select({
            id: groups.id,
            codigo: groups.codigo,
            gradeLevelId: groups.gradeLevelId,
            grado: gradeLevels.nombre,
            gradoCodigo: gradeLevels.codigo,
            jornada: groups.jornada,
            capacidad: groups.capacidad,
            director: users.nombreCompleto,
            matriculados: sql<number>`(select count(*)::int from enrollments e where e.group_id = groups.id and e.estado = 'ACTIVA')`,
            asignaciones: sql<number>`(select count(*)::int from teacher_assignments t where t.group_id = groups.id)`,
          })
          .from(groups)
          .innerJoin(gradeLevels, eq(gradeLevels.id, groups.gradeLevelId))
          .leftJoin(users, eq(users.id, groups.directorId))
          .where(and(eq(groups.institutionId, session.institutionId), eq(groups.academicYearId, anio.id)))
          .orderBy(asc(gradeLevels.codigo), asc(groups.codigo))
      : [];

    return { anios, anio, grados, grupos: lista };
  });
}
