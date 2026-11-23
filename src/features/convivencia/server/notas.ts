import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { withTenant, type Tx } from "@/db/client";
import { convivenciaGrades, enrollments, gradeLevels, groups, periods, users } from "@/db/schema";
import type { Session } from "@/lib/auth/session";
import { leerAnioActivo } from "@/features/periodos/server/queries";
import { leerEscala } from "@/lib/grading/escala.server";
import { desempenoDe, type DesempenoCodigo, type Escala } from "@/lib/grading/calc";
import { periodoPorDefecto } from "@/features/planilla/server/queries";

export type GrupoNotaConvivencia = { id: string; codigo: string; grado: string; gradoCodigo: number; director: string | null };
export type PeriodoNotaConvivencia = { id: string; nombre: string; numero: number; cerrado: boolean; fechaInicio: string; fechaFin: string };
export type FilaNotaConvivencia = { enrollmentId: string; estudiante: string; documento: string; nota: number | null; observacion: string | null };

export type PlanillaConvivencia = {
  anio: number;
  grupos: GrupoNotaConvivencia[];
  grupo: GrupoNotaConvivencia | null;
  periodos: PeriodoNotaConvivencia[];
  periodo: PeriodoNotaConvivencia | null;
  filas: FilaNotaConvivencia[];
  escala: Escala;
  editable: boolean;
  motivoLectura: string | null;
};

/** Coordinación edita todos los grupos; el docente, solo los que dirige; rectoría consulta. */
async function gruposVisibles(tx: Tx, session: Session, academicYearId: string): Promise<GrupoNotaConvivencia[]> {
  const director = users;
  const condiciones = [eq(groups.institutionId, session.institutionId), eq(groups.academicYearId, academicYearId)];
  if (session.rol === "TEACHER") condiciones.push(eq(groups.directorId, session.userId));
  const filas = await tx
    .select({
      id: groups.id,
      codigo: groups.codigo,
      grado: gradeLevels.nombre,
      gradoCodigo: gradeLevels.codigo,
      director: director.nombreCompleto,
    })
    .from(groups)
    .innerJoin(gradeLevels, eq(gradeLevels.id, groups.gradeLevelId))
    .leftJoin(director, eq(director.id, groups.directorId))
    .where(and(...condiciones))
    .orderBy(asc(gradeLevels.codigo), asc(groups.codigo));
  return filas;
}

export async function getPlanillaConvivencia(session: Session, groupId?: string, periodId?: string): Promise<PlanillaConvivencia | null> {
  return withTenant(session, async (tx) => {
    const anio = await leerAnioActivo(tx, session.institutionId);
    if (!anio) return null;
    const escala = await leerEscala(tx, session.institutionId);
    const grupos = await gruposVisibles(tx, session, anio.id);
    const grupo = grupos.find((g) => g.id === groupId) ?? grupos[0] ?? null;

    const periodos = await tx
      .select({
        id: periods.id,
        nombre: periods.nombre,
        numero: periods.numero,
        cerrado: periods.cerrado,
        fechaInicio: periods.fechaInicio,
        fechaFin: periods.fechaFin,
      })
      .from(periods)
      .where(and(eq(periods.institutionId, session.institutionId), eq(periods.academicYearId, anio.id)))
      .orderBy(asc(periods.numero));
    const periodo = periodos.find((p) => p.id === periodId) ?? periodoPorDefecto(periodos) ?? null;

    let filas: FilaNotaConvivencia[] = [];
    if (grupo && periodo) {
      const mats = await tx
        .select({ enrollmentId: enrollments.id, estudiante: users.nombreCompleto, documento: users.documentoIdentidad })
        .from(enrollments)
        .innerJoin(users, eq(users.id, enrollments.studentId))
        .where(and(eq(enrollments.groupId, grupo.id), eq(enrollments.estado, "ACTIVA")))
        .orderBy(asc(users.nombreCompleto));
      const notas = mats.length
        ? await tx
            .select({ enrollmentId: convivenciaGrades.enrollmentId, nota: convivenciaGrades.nota, observacion: convivenciaGrades.observacion })
            .from(convivenciaGrades)
            .where(and(eq(convivenciaGrades.periodId, periodo.id), inArray(convivenciaGrades.enrollmentId, mats.map((m) => m.enrollmentId))))
        : [];
      const porMatricula = new Map(notas.map((n) => [n.enrollmentId, n]));
      filas = mats.map((m) => ({
        enrollmentId: m.enrollmentId,
        estudiante: m.estudiante ?? "",
        documento: m.documento,
        nota: porMatricula.get(m.enrollmentId)?.nota ?? null,
        observacion: porMatricula.get(m.enrollmentId)?.observacion ?? null,
      }));
    }

    const puedeEditarRol = session.rol === "COORDINATOR" || session.rol === "TEACHER";
    const motivoLectura = !puedeEditarRol
      ? "Consulta: la nota de convivencia la registran coordinación y el director de grupo."
      : periodo?.cerrado
        ? `${periodo.nombre} está cerrado: la nota de convivencia es de solo lectura.`
        : null;

    return {
      anio: anio.anio,
      grupos,
      grupo,
      periodos,
      periodo,
      filas,
      escala,
      editable: puedeEditarRol && !!periodo && !periodo.cerrado,
      motivoLectura,
    };
  });
}

export type NotaConvivenciaPortal = {
  periodo: string;
  numero: number;
  cerrado: boolean;
  nota: number | null;
  desempeno: DesempenoCodigo | null;
  observacion: string | null;
};

/**
 * Notas de convivencia del estudiante en el año de su matrícula.
 * Como el boletín, solo se muestran los periodos CERRADOS (publicados).
 */
export async function notasConvivenciaDe(tx: Tx, institutionId: string, studentId: string): Promise<{ filas: NotaConvivenciaPortal[]; escala: Escala } | null> {
  const [mat] = await tx
    .select({ id: enrollments.id, academicYearId: enrollments.academicYearId })
    .from(enrollments)
    .innerJoin(groups, eq(groups.id, enrollments.groupId))
    .where(and(eq(enrollments.institutionId, institutionId), eq(enrollments.studentId, studentId)))
    .orderBy(desc(enrollments.fechaMatricula))
    .limit(1);
  if (!mat) return null;
  const escala = await leerEscala(tx, institutionId);
  const filas = await tx
    .select({
      periodo: periods.nombre,
      numero: periods.numero,
      cerrado: periods.cerrado,
      nota: convivenciaGrades.nota,
      observacion: convivenciaGrades.observacion,
    })
    .from(periods)
    .leftJoin(convivenciaGrades, and(eq(convivenciaGrades.periodId, periods.id), eq(convivenciaGrades.enrollmentId, mat.id)))
    .where(and(eq(periods.institutionId, institutionId), eq(periods.academicYearId, mat.academicYearId)))
    .orderBy(asc(periods.numero));
  return {
    escala,
    filas: filas.map((f) => ({
      ...f,
      nota: f.cerrado ? f.nota : null,
      observacion: f.cerrado ? f.observacion : null,
      desempeno: f.cerrado ? desempenoDe(f.nota, escala) : null,
    })),
  };
}
