import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { withTenant } from "@/db/client";
import { convivenciaGrades, grades, studentObserver } from "@/db/schema";
import type { Session } from "@/lib/auth/session";
import { leerEscala } from "@/lib/grading/escala.server";
import { desempenoDe, reprueba, type DesempenoCodigo, type Escala } from "@/lib/grading/calc";
import { estudiantesDelPortal } from "./acceso";
import { contextoEstudiante } from "./consultas";

export type PuntoPeriodo = { numero: number; nombre: string; promedio: number | null };

export type ResumenHijo = {
  id: string;
  nombre: string;
  grupo: string | null;
  grado: string | null;
  director: string | null;
  /** Último periodo publicado (cerrado); null si aún no hay boletines. */
  periodo: { id: string; nombre: string } | null;
  promedio: number | null;
  desempeno: DesempenoCodigo | null;
  /** Diferencia con el periodo publicado anterior (null si no hay con qué comparar). */
  tendencia: number | null;
  enBajo: number;
  asignaturas: number;
  convivencia: { nota: number; desempeno: DesempenoCodigo | null } | null;
  fallasAnio: number;
  /** Anotaciones del observador que el acudiente aún no ha firmado. */
  porFirmar: number;
  procesosAbiertos: number;
  historial: PuntoPeriodo[];
  periodoEnCurso: string | null;
};

export type ResumenAcudiente = { hijos: ResumenHijo[]; escala: Escala };

const promedioDe = (notas: (number | null)[]) => {
  const v = notas.filter((n): n is number => n !== null);
  return v.length ? Math.round((v.reduce((s, n) => s + n, 0) / v.length) * 100) / 100 : null;
};

/**
 * Panel de entrada del acudiente: un resumen por cada estudiante a su cargo.
 * Igual que el boletín, las notas cuentan solo en periodos CERRADOS (publicados);
 * las fallas y el observador son del año en curso.
 */
export async function getResumenAcudiente(session: Session): Promise<ResumenAcudiente> {
  return withTenant(session, async (tx) => {
    const escala = await leerEscala(tx, session.institutionId);
    const estudiantes = await estudiantesDelPortal(tx, session);
    const hijos: ResumenHijo[] = [];

    for (const e of estudiantes) {
      const ctx = await contextoEstudiante(tx, session, e.id);
      if (!ctx) {
        hijos.push({
          id: e.id, nombre: e.nombre, grupo: e.grupo, grado: null, director: null, periodo: null, promedio: null, desempeno: null,
          tendencia: null, enBajo: 0, asignaturas: 0, convivencia: null, fallasAnio: 0, porFirmar: 0, procesosAbiertos: 0, historial: [],
          periodoEnCurso: null,
        });
        continue;
      }

      const cerrados = ctx.periodos.filter((p) => p.cerrado);
      const notas = await tx
        .select({ periodId: grades.periodId, nota: grades.notaFinal, fallas: grades.fallas })
        .from(grades)
        .where(and(eq(grades.enrollmentId, ctx.enrollmentId), inArray(grades.periodId, ctx.periodos.map((p) => p.id))));

      const historial = cerrados.map((p) => ({
        numero: p.numero,
        nombre: p.nombre,
        promedio: promedioDe(notas.filter((n) => n.periodId === p.id).map((n) => n.nota)),
      }));
      const ultimo = cerrados.at(-1) ?? null;
      const delUltimo = ultimo ? notas.filter((n) => n.periodId === ultimo.id && n.nota !== null).map((n) => n.nota as number) : [];
      const promedio = historial.at(-1)?.promedio ?? null;
      const anterior = historial.at(-2)?.promedio ?? null;

      const [conv] = ultimo
        ? await tx
            .select({ nota: convivenciaGrades.nota })
            .from(convivenciaGrades)
            .where(and(eq(convivenciaGrades.enrollmentId, ctx.enrollmentId), eq(convivenciaGrades.periodId, ultimo.id)))
        : [];

      const [obs] = await tx
        .select({
          porFirmar: sql<number>`count(*) filter (where ${studentObserver.acudienteId} is null and ${studentObserver.tipo} <> 'FELICITACION')::int`,
          procesos: sql<number>`count(*) filter (where ${studentObserver.proceso} = 'ABIERTO')::int`,
        })
        .from(studentObserver)
        .where(and(eq(studentObserver.enrollmentId, ctx.enrollmentId), eq(studentObserver.institutionId, session.institutionId)));

      hijos.push({
        id: e.id,
        nombre: ctx.estudiante.nombre,
        grupo: ctx.estudiante.grupo,
        grado: ctx.estudiante.grado,
        director: ctx.estudiante.director,
        periodo: ultimo ? { id: ultimo.id, nombre: ultimo.nombre } : null,
        promedio,
        desempeno: desempenoDe(promedio === null ? null : Math.round(promedio * 10) / 10, escala),
        tendencia: promedio !== null && anterior !== null ? Math.round((promedio - anterior) * 100) / 100 : null,
        enBajo: delUltimo.filter((n) => reprueba(n, escala)).length,
        asignaturas: delUltimo.length,
        convivencia: conv ? { nota: conv.nota, desempeno: desempenoDe(conv.nota, escala) } : null,
        fallasAnio: notas.reduce((s, n) => s + n.fallas, 0),
        porFirmar: obs?.porFirmar ?? 0,
        procesosAbiertos: obs?.procesos ?? 0,
        historial,
        periodoEnCurso: ctx.periodos.find((p) => !p.cerrado)?.nombre ?? null,
      });
    }
    return { hijos, escala };
  });
}

