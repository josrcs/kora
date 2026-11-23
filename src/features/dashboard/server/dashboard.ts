import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { withTenant } from "@/db/client";
import { enrollments, gradeLevels, grades, groups, periods, subjects, teacherAssignments, users } from "@/db/schema";
import type { Session } from "@/lib/auth/session";
import { calcularDefinitiva, desempenoDe, redondear, reprueba, type DesempenoCodigo } from "@/lib/grading/calc";
import { leerEscala } from "@/lib/grading/escala.server";
import { leerAnioActivo, leerAvanceAsignaciones } from "@/features/periodos/server/queries";
import { estadoAvance } from "@/features/periodos/types";

export type ConteoDesempeno = Record<DesempenoCodigo, number>;

export type Dashboard = {
  anio: number;
  aprobatoria: number;
  decimales: 1 | 2;
  periodos: { id: string; nombre: string; numero: number; cerrado: boolean }[];
  /** Periodo analizado (por defecto el último cerrado). */
  periodo: { id: string; nombre: string; numero: number; cerrado: boolean };
  /** Periodo abierto más antiguo: lo que coordinación está persiguiendo ahora. */
  enCurso: {
    id: string;
    nombre: string;
    fechaLimiteNotas: string | null;
    celdas: number;
    conNota: number;
    docentes: number;
    docentesConPendientes: number;
  } | null;
  resumen: { notas: number; promedio: number | null; enBajo: number; estudiantes: number };
  grupos: { id: string; codigo: string; conteo: ConteoDesempeno; total: number; promedio: number | null }[];
  asignaturas: { nombre: string; total: number; reprobadas: number }[];
  /** Estudiantes con 3+ asignaturas en desempeño bajo en el acumulado del año. */
  riesgo: { studentId: string; nombre: string; grupo: string; asignaturas: string[] }[];
  enRiesgoLeve: number; // 1 o 2 asignaturas en bajo
};

const vacio = (): ConteoDesempeno => ({ BAJO: 0, BASICO: 0, ALTO: 0, SUPERIOR: 0 });
const promedioCentesimas = (notas: number[], decimales: 1 | 2) =>
  notas.length ? redondear(notas.reduce((s, n) => s + Math.round(n * 100), 0) / notas.length / 100, decimales) : null;

export const UMBRAL_RIESGO = 3;

export async function getDashboard(session: Session, periodId?: string): Promise<Dashboard | null> {
  return withTenant(session, async (tx) => {
    const anio = await leerAnioActivo(tx, session.institutionId);
    if (!anio) return null;
    const escala = await leerEscala(tx, session.institutionId);

    const pers = await tx
      .select({
        id: periods.id,
        nombre: periods.nombre,
        numero: periods.numero,
        cerrado: periods.cerrado,
        porcentaje: periods.porcentaje,
        fechaLimiteNotas: periods.fechaLimiteNotas,
      })
      .from(periods)
      .where(and(eq(periods.institutionId, session.institutionId), eq(periods.academicYearId, anio.id)))
      .orderBy(asc(periods.numero));
    if (pers.length === 0) return null;

    const periodo = pers.find((p) => p.id === periodId) ?? pers.filter((p) => p.cerrado).at(-1) ?? pers[0];

    // Avance del periodo abierto más antiguo.
    const abierto = pers.find((p) => !p.cerrado);
    let enCurso: Dashboard["enCurso"] = null;
    if (abierto) {
      const filas = await leerAvanceAsignaciones(tx, session.institutionId, abierto.id);
      const porDocente = new Map<string, { estudiantes: number; conNota: number }>();
      for (const f of filas) {
        const d = porDocente.get(f.teacherId) ?? { estudiantes: 0, conNota: 0 };
        d.estudiantes += f.estudiantes;
        d.conNota += f.conNota;
        porDocente.set(f.teacherId, d);
      }
      const docentes = [...porDocente.values()];
      enCurso = {
        id: abierto.id,
        nombre: abierto.nombre,
        fechaLimiteNotas: abierto.fechaLimiteNotas,
        celdas: filas.reduce((s, f) => s + f.estudiantes, 0),
        conNota: filas.reduce((s, f) => s + f.conNota, 0),
        docentes: docentes.length,
        docentesConPendientes: docentes.filter((d) => ["en-curso", "sin-empezar"].includes(estadoAvance(d))).length,
      };
    }

    // Notas de los estudiantes con matrícula activa, de los periodos hasta el analizado.
    const hasta = pers.filter((p) => p.numero <= periodo.numero);
    const notas = await tx
      .select({
        studentId: enrollments.studentId,
        estudiante: users.nombreCompleto,
        groupId: groups.id,
        grupo: groups.codigo,
        gradoCodigo: gradeLevels.codigo,
        grado: gradeLevels.nombre,
        assignmentId: grades.teacherAssignmentId,
        asignatura: subjects.nombre,
        periodId: grades.periodId,
        nota: grades.notaFinal,
      })
      .from(grades)
      .innerJoin(enrollments, eq(enrollments.id, grades.enrollmentId))
      .innerJoin(users, eq(users.id, enrollments.studentId))
      .innerJoin(groups, eq(groups.id, enrollments.groupId))
      .innerJoin(gradeLevels, eq(gradeLevels.id, groups.gradeLevelId))
      .innerJoin(teacherAssignments, eq(teacherAssignments.id, grades.teacherAssignmentId))
      .innerJoin(subjects, eq(subjects.id, teacherAssignments.subjectId))
      .where(
        and(
          eq(grades.institutionId, session.institutionId),
          eq(enrollments.academicYearId, anio.id),
          eq(enrollments.estado, "ACTIVA"),
          inArray(grades.periodId, hasta.map((p) => p.id)),
        ),
      )
      .orderBy(asc(gradeLevels.codigo), asc(groups.codigo));

    // ---- Periodo analizado: distribución por grupo y reprobación por asignatura.
    const delPeriodo = notas.filter((n) => n.periodId === periodo.id && n.nota !== null) as (typeof notas[number] & { nota: number })[];
    const grupos = new Map<string, Dashboard["grupos"][number] & { notas: number[] }>();
    const asignaturas = new Map<string, Dashboard["asignaturas"][number]>();
    for (const n of delPeriodo) {
      // Con 44 salones, el reparto se muestra por grado (el detalle por salón está en Rectoría y en Corte preventivo).
      const clave = String(n.gradoCodigo);
      const g = grupos.get(clave) ?? { id: clave, codigo: n.grado, conteo: vacio(), total: 0, promedio: null, notas: [] };
      const d = desempenoDe(n.nota, escala);
      if (d) g.conteo[d]++;
      g.total++;
      g.notas.push(n.nota);
      grupos.set(clave, g);

      const a = asignaturas.get(n.asignatura) ?? { nombre: n.asignatura, total: 0, reprobadas: 0 };
      a.total++;
      if (reprueba(n.nota, escala)) a.reprobadas++;
      asignaturas.set(n.asignatura, a);
    }

    // ---- Acumulado del año por estudiante y asignatura (mismo cálculo que el boletín).
    const pesos = hasta.map((p) => ({ id: p.id, porcentaje: p.porcentaje }));
    const porEstAsig = new Map<string, { studentId: string; nombre: string; grupo: string; asignatura: string; notas: Record<string, number | null> }>();
    for (const n of notas) {
      const k = `${n.studentId}|${n.assignmentId}`;
      const e = porEstAsig.get(k) ?? { studentId: n.studentId, nombre: n.estudiante ?? "", grupo: n.grupo, asignatura: n.asignatura, notas: {} };
      e.notas[n.periodId] = n.nota;
      porEstAsig.set(k, e);
    }
    const bajasPorEstudiante = new Map<string, { studentId: string; nombre: string; grupo: string; asignaturas: string[] }>();
    for (const e of porEstAsig.values()) {
      const acumulado = calcularDefinitiva(pesos, e.notas, escala.decimales).parcial;
      const est = bajasPorEstudiante.get(e.studentId) ?? { studentId: e.studentId, nombre: e.nombre, grupo: e.grupo, asignaturas: [] };
      if (reprueba(acumulado, escala)) est.asignaturas.push(e.asignatura);
      bajasPorEstudiante.set(e.studentId, est);
    }
    const estudiantes = [...bajasPorEstudiante.values()];
    const riesgo = estudiantes
      .filter((e) => e.asignaturas.length >= UMBRAL_RIESGO)
      .map((e) => ({ ...e, asignaturas: e.asignaturas.sort((a, b) => a.localeCompare(b)) }))
      .sort((a, b) => b.asignaturas.length - a.asignaturas.length || a.grupo.localeCompare(b.grupo) || a.nombre.localeCompare(b.nombre));

    return {
      anio: anio.anio,
      aprobatoria: escala.aprobatoria,
      decimales: escala.decimales,
      periodos: pers.map(({ id, nombre, numero, cerrado }) => ({ id, nombre, numero, cerrado })),
      periodo: { id: periodo.id, nombre: periodo.nombre, numero: periodo.numero, cerrado: periodo.cerrado },
      enCurso,
      resumen: {
        notas: delPeriodo.length,
        promedio: promedioCentesimas(delPeriodo.map((n) => n.nota), escala.decimales),
        enBajo: delPeriodo.filter((n) => reprueba(n.nota, escala)).length,
        estudiantes: new Set(delPeriodo.map((n) => n.studentId)).size,
      },
      grupos: [...grupos.values()].map(({ notas: ns, ...g }) => ({ ...g, promedio: promedioCentesimas(ns, escala.decimales) })),
      asignaturas: [...asignaturas.values()].sort((a, b) => b.reprobadas / b.total - a.reprobadas / a.total || a.nombre.localeCompare(b.nombre)),
      riesgo,
      enRiesgoLeve: estudiantes.filter((e) => e.asignaturas.length > 0 && e.asignaturas.length < UMBRAL_RIESGO).length,
    };
  });
}
