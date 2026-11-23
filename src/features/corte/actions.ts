"use server";

import { refresh } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/db/client";
import { errorPostgres } from "@/db/errors";
import { periods } from "@/db/schema";
import { ROLES_COORDINACION, sessionParaAccion } from "@/lib/auth/session";

export type EstadoCorte = { ok: boolean; error: string | null; mensaje?: string };

/**
 * Corte preventivo: foto de las notas parciales del periodo en curso (se puede
 * rehacer; reemplaza la anterior). Lo hace coordinación a mitad de periodo.
 */
export async function generarCorte(_prev: EstadoCorte, formData: FormData): Promise<EstadoCorte> {
  const session = await sessionParaAccion(ROLES_COORDINACION);
  if (!session) return { ok: false, error: "Solo coordinación genera el corte preventivo." };
  const periodId = z.uuid().safeParse(formData.get("periodId"));
  if (!periodId.success) return { ok: false, error: "Periodo inválido." };
  try {
    const n = await withTenant(session, async (tx) => {
      const [p] = await tx
        .select({ id: periods.id })
        .from(periods)
        .where(and(eq(periods.id, periodId.data), eq(periods.institutionId, session.institutionId)));
      if (!p) return null;
      const { rows } = await tx.execute<{ n: number }>(sql`select fn_generar_corte_preventivo(${p.id}, ${session.userId}) as n`);
      return rows[0].n;
    });
    if (n === null) return { ok: false, error: "El periodo no existe." };
    refresh();
    return { ok: true, error: null, mensaje: `Corte generado: ${n.toLocaleString("es-CO")} notas parciales registradas.` };
  } catch (err) {
    const pg = errorPostgres(err);
    if (pg?.hint === "CORTE") return { ok: false, error: pg.message };
    console.error("[corte]", err);
    return { ok: false, error: "No se pudo generar el corte." };
  }
}
