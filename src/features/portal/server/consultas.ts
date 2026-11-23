import { notasConvivenciaDe } from "@/features/convivencia/server/notas";
import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { withTenant, type Tx } from "@/db/client";
import {
  academicYears,
  achievements,
  convivenciaGrades,
  areas,
  enrollments,
  gradeLevels,
  grades,
  groups,
  institutions,
  periods,
  studentObserver,
  subjects,
  teacherAssignments,
  users,
  preventiveCutGrades,
  preventiveCuts,
} from "@/db/schema";
import type { Session } from "@/lib/auth/session";
import { calcularDefinitiva, desempenoDe, redondear, reprueba } from "@/lib/grading/calc";
import { leerEscala } from "@/lib/grading/escala.server";
import type { AnotacionPortal, AsistenciaData, BoletinData, FilaBoletin, PeriodoPortal } from "../types";
import { puedeVerEstudiante } from "./acceso";

const JORNADA: Record<string, string> = {
  MANANA: "Mañana",
  TARDE: "Tarde",
  NOCHE: "Noche",
  UNICA: "Única",
  FIN_DE_SEMANA: "Fin de semana",
};

/* ------------------------------------------------------------------ */
/*  Contexto: matrícula del año activo, grupo y periodos               */
/* ------------------------------------------------------------------ */
async function contextoEstudiante(tx: Tx, session: Session, studentId: string) {
  if (!(await puedeVerEstudiante(tx, session, studentId))) return null;

  const estudiante = alias(users, "estudiante");
  const director = alias(users, "director");
  const [row] = await tx
    .select({
      enrollmentId: enrollments.id,
      groupId: groups.id,
      gradeLevelId: groups.gradeLevelId,
      academicYearId: academicYears.id,
      anio: academicYears.anio,
      grupo: groups.codigo,
      grado: gradeLevels.nombre,
      jornada: groups.jornada,
      nombre: estudiante.nombreCompleto,
      tipoDocumento: estudiante.tipoDocumento,
      documento: estudiante.documentoIdentidad,
      directorNombres: director.nombres,
      directorApellidos: director.apellidos,
    })
    .from(enrollments)
    .innerJoin(academicYears, and(eq(academicYears.id, enrollments.academicYearId), eq(academicYears.activo, true)))
    .innerJoin(groups, eq(groups.id, enrollments.groupId))
    .innerJoin(gradeLevels, eq(gradeLevels.id, groups.gradeLevelId))
    .innerJoin(estudiante, eq(estudiante.id, enrollments.studentId))
    .leftJoin(director, eq(director.id, groups.directorId))
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.institutionId, session.institutionId)));
  if (!row) return null;

  const periodos: PeriodoPortal[] = (
    await tx.select().from(periods).where(eq(periods.academicYearId, row.academicYearId)).orderBy(asc(periods.numero))
  ).map((p) => ({
    id: p.id,
    numero: p.numero,
    nombre: p.nombre,
    porcentaje: p.porcentaje,
    fechaInicio: p.fechaInicio,
    fechaFin: p.fechaFin,
    cerrado: p.cerrado,
  }));

  return {
    ...row,
    periodos,
    estudiante: {
      id: studentId,
      nombre: row.nombre ?? "",
      tipoDocumento: row.tipoDocumento,
      documento: row.documento,
      grado: row.grado,
      grupo: row.grupo,
      jornada: JORNADA[row.jornada] ?? row.jornada,
      director: row.directorNombres ? `${row.directorNombres} ${row.directorApellidos}` : null,
    },
  };
}

/** Asignaturas del grupo con área y docente, en el orden del boletín. */
async function cargaDelGrupo(tx: Tx, groupId: string) {
  return tx
    .select({
      assignmentId: teacherAssignments.id,
      subjectId: subjects.id,
      asignatura: subjects.nombre,
      area: areas.nombre,
      intensidadHoraria: teacherAssignments.intensidadHoraria,
      docenteNombres: users.nombres,
      docenteApellidos: users.apellidos,
    })
    .from(teacherAssignments)
    .innerJoin(subjects, eq(subjects.id, teacherAssignments.subjectId))
    .innerJoin(areas, eq(areas.id, subjects.areaId))
    .innerJoin(users, eq(users.id, teacherAssignments.teacherId))
    .where(eq(teacherAssignments.groupId, groupId))
    .orderBy(asc(areas.orden), asc(subjects.nombre));
}

/* ------------------------------------------------------------------ */
/*  Boletín: solo periodos CERRADOS (publicados por coordinación)      */
/* ------------------------------------------------------------------ */
export type ResultadoBoletin =
  | { estado: "ok"; data: BoletinData; periodos: PeriodoPortal[] }
  | { estado: "sin-publicar"; periodoActual: PeriodoPortal | null }
  | { estado: "sin-acceso" };

export async function getBoletin(session: Session, studentId: string, periodId?: string): Promise<ResultadoBoletin> {
  return withTenant(session, async (tx) => {
    const ctx = await contextoEstudiante(tx, session, studentId);
    if (!ctx) return { estado: "sin-acceso" };

    const publicados = ctx.periodos.filter((p) => p.cerrado);
    if (publicados.length === 0) {
      return { estado: "sin-publicar", periodoActual: ctx.periodos.find((p) => !p.cerrado) ?? null };
    }
    const periodo = publicados.find((p) => p.id === periodId) ?? publicados.at(-1)!;
    const hasta = publicados.filter((p) => p.numero <= periodo.numero);

    const escala = await leerEscala(tx, session.institutionId);
    const [membrete] = await tx
      .select({
        nombre: institutions.nombre,
        codigoDane: institutions.codigoDane,
        nit: institutions.nit,
        municipio: institutions.municipio,
        departamento: institutions.departamento,
        direccion: institutions.direccion,
        telefono: institutions.telefono,
        resolucion: institutions.resolucion,
        logoUrl: institutions.logoUrl,
      })
      .from(institutions)
      .where(eq(institutions.id, session.institutionId));

    const carga = await cargaDelGrupo(tx, ctx.groupId);
    const calificaciones = await tx
      .select({
        assignmentId: grades.teacherAssignmentId,
        periodId: grades.periodId,
        nota: grades.notaFinal,
        fallas: grades.fallas,
        observacion: grades.observacion,
      })
      .from(grades)
      .where(and(eq(grades.enrollmentId, ctx.enrollmentId), inArray(grades.periodId, hasta.map((p) => p.id))));
    const logros = await tx
      .select({ subjectId: achievements.subjectId, codigo: achievements.codigo, descripcion: achievements.descripcion })
      .from(achievements)
      .where(and(eq(achievements.periodId, periodo.id), eq(achievements.gradeLevelId, ctx.gradeLevelId)))
      .orderBy(asc(achievements.orden), asc(achievements.codigo));

    const [conv] = await tx
      .select({ nota: convivenciaGrades.nota, observacion: convivenciaGrades.observacion })
      .from(convivenciaGrades)
      .where(and(eq(convivenciaGrades.enrollmentId, ctx.enrollmentId), eq(convivenciaGrades.periodId, periodo.id)));

    const pesos = hasta.map((p) => ({ id: p.id, porcentaje: p.porcentaje }));
    const porArea = new Map<string, FilaBoletin[]>();
    for (const a of carga) {
      const deEsta = calificaciones.filter((c) => c.assignmentId === a.assignmentId);
      const notas = Object.fromEntries(hasta.map((p) => [p.id, deEsta.find((c) => c.periodId === p.id)?.nota ?? null]));
      const actual = deEsta.find((c) => c.periodId === periodo.id);
      const nota = actual?.nota ?? null;
      const fila: FilaBoletin = {
        asignatura: a.asignatura,
        intensidadHoraria: a.intensidadHoraria,
        docente: `${a.docenteNombres} ${a.docenteApellidos}`,
        notas,
        nota,
        desempeno: desempenoDe(nota, escala),
        fallas: actual?.fallas ?? 0,
        acumulado: calcularDefinitiva(pesos, notas, escala.decimales).parcial,
        logros: logros.filter((l) => l.subjectId === a.subjectId).map(({ codigo, descripcion }) => ({ codigo, descripcion })),
        observacion: actual?.observacion ?? null,
      };
      porArea.set(a.area, [...(porArea.get(a.area) ?? []), fila]);
    }

    const filas = [...porArea.values()].flat();
    const conNota = filas.map((f) => f.nota).filter((n): n is number => n !== null);
    const promedio = conNota.length
      ? redondear(conNota.reduce((s, n) => s + Math.round(n * 100), 0) / conNota.length / 100, 2)
      : null;

    return {
      estado: "ok",
      periodos: ctx.periodos,
      data: {
        membrete,
        anio: ctx.anio,
        estudiante: ctx.estudiante,
        periodo,
        periodosPublicados: hasta,
        escala,
        areas: [...porArea.entries()].map(([nombre, filas]) => ({ nombre, filas })),
        resumen: {
          promedio,
          enBajo: conNota.filter((n) => reprueba(n, escala)).length,
          fallas: filas.reduce((s, f) => s + f.fallas, 0),
          sinNota: filas.length - conNota.length,
        },
        convivencia: { nota: conv?.nota ?? null, desempeno: desempenoDe(conv?.nota ?? null, escala), observacion: conv?.observacion ?? null },
        generadoEn: new Date().toISOString(),
      },
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Asistencia: fallas por asignatura y periodo (incluye el periodo    */
/*  en curso, marcado como parcial)                                    */
/* ------------------------------------------------------------------ */
export async function getAsistencia(session: Session, studentId: string): Promise<AsistenciaData | null> {
  return withTenant(session, async (tx) => {
    const ctx = await contextoEstudiante(tx, session, studentId);
    if (!ctx) return null;

    const hoy = new Date().toISOString().slice(0, 10);
    const iniciados = ctx.periodos.filter((p) => p.fechaInicio <= hoy);
    const carga = await cargaDelGrupo(tx, ctx.groupId);
    const fallas = iniciados.length
      ? await tx
          .select({ assignmentId: grades.teacherAssignmentId, periodId: grades.periodId, fallas: grades.fallas })
          .from(grades)
          .where(and(eq(grades.enrollmentId, ctx.enrollmentId), inArray(grades.periodId, iniciados.map((p) => p.id))))
      : [];

    const filas = carga.map((a) => {
      const porPeriodo = Object.fromEntries(
        iniciados.map((p) => [p.id, fallas.find((f) => f.assignmentId === a.assignmentId && f.periodId === p.id)?.fallas ?? 0]),
      );
      return {
        asignatura: a.asignatura,
        area: a.area,
        intensidadHoraria: a.intensidadHoraria,
        fallas: porPeriodo,
        total: Object.values(porPeriodo).reduce((s, n) => s + n, 0),
      };
    });

    return {
      periodos: iniciados.map((p) => ({
        ...p,
        semanas: Math.max(1, Math.round((Date.parse(p.fechaFin) - Date.parse(p.fechaInicio)) / (7 * 86_400_000))),
      })),
      filas,
      totales: Object.fromEntries(iniciados.map((p) => [p.id, filas.reduce((s, f) => s + f.fallas[p.id], 0)])),
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Observador del estudiante                                          */
/* ------------------------------------------------------------------ */
export async function getObservador(session: Session, studentId: string): Promise<AnotacionPortal[] | null> {
  return withTenant(session, async (tx) => {
    if (!(await puedeVerEstudiante(tx, session, studentId))) return null;
    const autor = alias(users, "autor");
    const acudiente = alias(users, "acudiente");
    const rows = await tx
      .select({
        id: studentObserver.id,
        fecha: studentObserver.fecha,
        tipo: studentObserver.tipo,
        situacion: studentObserver.situacion,
        descripcion: studentObserver.descripcion,
        accionPedagogica: studentObserver.accionPedagogica,
        autorNombres: autor.nombres,
        autorApellidos: autor.apellidos,
        descargos: studentObserver.descargos,
        descargosAt: studentObserver.descargosAt,
        acudienteNombres: acudiente.nombres,
        acudienteApellidos: acudiente.apellidos,
        confirmadoAt: studentObserver.acudienteConfirmadoAt,
      })
      .from(studentObserver)
      .innerJoin(autor, eq(autor.id, studentObserver.autorId))
      .leftJoin(acudiente, eq(acudiente.id, studentObserver.acudienteId))
      .where(and(eq(studentObserver.studentId, studentId), eq(studentObserver.institutionId, session.institutionId)))
      .orderBy(desc(studentObserver.fecha), desc(studentObserver.createdAt));

    return rows.map((r) => ({
      id: r.id,
      fecha: r.fecha,
      tipo: r.tipo,
      situacion: r.situacion,
      descripcion: r.descripcion,
      accionPedagogica: r.accionPedagogica,
      autor: `${r.autorNombres} ${r.autorApellidos}`,
      descargos: r.descargos,
      descargosAt: r.descargosAt?.toISOString() ?? null,
      firma: r.confirmadoAt ? { acudiente: `${r.acudienteNombres} ${r.acudienteApellidos}`, en: r.confirmadoAt.toISOString() } : null,
      puedeFirmar: session.rol === "GUARDIAN" && !r.confirmadoAt,
      puedeDescargos: session.rol === "STUDENT" && session.userId === studentId && !r.descargos && r.tipo !== "FELICITACION",
    }));
  });
}

/* ------------------------------------------------------------------ */
/*  Informe preventivo: notas parciales del último corte del año       */
/* ------------------------------------------------------------------ */
export type InformePreventivo = {
  periodo: { nombre: string; numero: number };
  realizadoAt: string;
  aprobatoria: number;
  decimales: 1 | 2;
  filas: { asignatura: string; area: string; docente: string; nota: number | null; desempeno: ReturnType<typeof desempenoDe> }[];
};

export async function getInformePreventivo(session: Session, studentId: string): Promise<InformePreventivo | "sin-corte" | null> {
  return withTenant(session, async (tx) => {
    const ctx = await contextoEstudiante(tx, session, studentId);
    if (!ctx) return null;
    const [corte] = await tx
      .select({ id: preventiveCuts.id, realizadoAt: preventiveCuts.realizadoAt, periodId: preventiveCuts.periodId })
      .from(preventiveCuts)
      .innerJoin(periods, eq(periods.id, preventiveCuts.periodId))
      .where(and(eq(periods.academicYearId, ctx.academicYearId), eq(preventiveCuts.institutionId, session.institutionId)))
      .orderBy(desc(periods.numero))
      .limit(1);
    if (!corte) return "sin-corte";
    const escala = await leerEscala(tx, session.institutionId);
    const carga = await cargaDelGrupo(tx, ctx.groupId);
    const notas = await tx
      .select({ assignmentId: preventiveCutGrades.teacherAssignmentId, nota: preventiveCutGrades.nota })
      .from(preventiveCutGrades)
      .where(and(eq(preventiveCutGrades.cutId, corte.id), eq(preventiveCutGrades.enrollmentId, ctx.enrollmentId)));
    const periodo = ctx.periodos.find((p) => p.id === corte.periodId)!;
    return {
      periodo: { nombre: periodo.nombre, numero: periodo.numero },
      realizadoAt: corte.realizadoAt.toISOString(),
      aprobatoria: escala.aprobatoria,
      decimales: escala.decimales,
      filas: carga.map((a) => {
        const nota = notas.find((n) => n.assignmentId === a.assignmentId)?.nota ?? null;
        return { asignatura: a.asignatura, area: a.area, docente: `${a.docenteNombres} ${a.docenteApellidos}`, nota, desempeno: desempenoDe(nota, escala) };
      }),
    };
  });
}

/** Nota de convivencia por periodo (solo periodos cerrados, como el boletín). */
export async function getConvivenciaPortal(session: Session, studentId: string) {
  return withTenant(session, async (tx) => {
    if (!(await puedeVerEstudiante(tx, session, studentId))) return null;
    return notasConvivenciaDe(tx, session.institutionId, studentId);
  });
}
