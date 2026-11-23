import "server-only";
import { asc, eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { institutions, performanceLevels } from "@/db/schema";
import type { Escala } from "./calc";

/** Escala de valoración y rangos de desempeño del colegio (SIEE). */
export async function leerEscala(tx: Tx, institutionId: string): Promise<Escala> {
  const [inst] = await tx
    .select({
      min: institutions.escalaMin,
      max: institutions.escalaMax,
      aprobatoria: institutions.notaAprobatoria,
      decimales: institutions.decimalesNota,
    })
    .from(institutions)
    .where(eq(institutions.id, institutionId));
  const niveles = await tx
    .select({ desempeno: performanceLevels.desempeno, desde: performanceLevels.notaDesde, hasta: performanceLevels.notaHasta })
    .from(performanceLevels)
    .where(eq(performanceLevels.institutionId, institutionId))
    .orderBy(asc(performanceLevels.notaDesde));
  return { ...inst, decimales: inst.decimales === 2 ? 2 : 1, niveles };
}
