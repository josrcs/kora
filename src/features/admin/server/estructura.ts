import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { withTenant } from "@/db/client";
import { areas, gradeLevels, subjects } from "@/db/schema";
import type { Session } from "@/lib/auth/session";

export type GradoAdmin = { id: string; codigo: number; nombre: string; nivel: string; grupos: number };
export type AsignaturaAdmin = { id: string; nombre: string; abreviatura: string; activo: boolean; asignaciones: number };
export type AreaAdmin = { id: string; nombre: string; orden: number; asignaturas: AsignaturaAdmin[] };

export async function getEstructura(session: Session): Promise<{ grados: GradoAdmin[]; areas: AreaAdmin[] }> {
  return withTenant(session, async (tx) => {
    const grados = await tx
      .select({
        id: gradeLevels.id,
        codigo: gradeLevels.codigo,
        nombre: gradeLevels.nombre,
        nivel: gradeLevels.nivel,
        grupos: sql<number>`(select count(*)::int from groups g where g.grade_level_id = grade_levels.id)`,
      })
      .from(gradeLevels)
      .where(eq(gradeLevels.institutionId, session.institutionId))
      .orderBy(asc(gradeLevels.codigo));

    const listaAreas = await tx
      .select({ id: areas.id, nombre: areas.nombre, orden: areas.orden })
      .from(areas)
      .where(eq(areas.institutionId, session.institutionId))
      .orderBy(asc(areas.orden), asc(areas.nombre));

    const materias = await tx
      .select({
        id: subjects.id,
        areaId: subjects.areaId,
        nombre: subjects.nombre,
        abreviatura: subjects.abreviatura,
        activo: subjects.activo,
        asignaciones: sql<number>`(select count(*)::int from teacher_assignments t where t.subject_id = subjects.id)`,
      })
      .from(subjects)
      .where(eq(subjects.institutionId, session.institutionId))
      .orderBy(asc(subjects.nombre));

    return {
      grados,
      areas: listaAreas.map((a) => ({ ...a, asignaturas: materias.filter((m) => m.areaId === a.id) })),
    };
  });
}
