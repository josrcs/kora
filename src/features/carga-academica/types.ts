import { z } from "zod";

export type GrupoCarga = {
  id: string;
  codigo: string;
  grado: string;
  gradoCodigo: number;
  directorId: string | null;
  estudiantes: number;
  asignadas: number;
};

export type DocenteOpcion = { id: string; nombre: string; rol: "TEACHER" | "COORDINATOR" };

export type FilaCarga = {
  subjectId: string;
  asignatura: string;
  abreviatura: string;
  area: string;
  assignmentId: string | null;
  teacherId: string | null;
  intensidadHoraria: number | null;
  /** Calificaciones ya registradas con esta asignación (si > 0 no se puede quitar). */
  calificaciones: number;
};

export type ResumenDocente = {
  id: string;
  nombre: string;
  horas: number;
  asignaciones: number;
  grupos: string[];
  esDirectorDe: string[];
};

export type CargaAcademica = {
  anio: number;
  grupos: GrupoCarga[];
  docentes: DocenteOpcion[];
  totalAsignaturas: number;
  grupo: GrupoCarga | null;
  filas: FilaCarga[];
  resumen: ResumenDocente[];
};

export type EstadoCarga = { ok: boolean; error: string | null; mensaje?: string };
export const estadoCargaInicial: EstadoCarga = { ok: false, error: null };

export const asignacionSchema = z.object({
  groupId: z.uuid(),
  subjectId: z.uuid(),
  teacherId: z.uuid({ error: "Seleccione un docente." }),
  intensidadHoraria: z.coerce
    .number({ error: "Intensidad horaria inválida." })
    .int("La intensidad horaria es un número entero de horas.")
    .min(1, "Mínimo 1 hora semanal.")
    .max(40, "Máximo 40 horas semanales."),
});

export const quitarSchema = z.object({ assignmentId: z.uuid() });

export const directorSchema = z.object({
  groupId: z.uuid(),
  directorId: z.union([z.literal(""), z.uuid()]).transform((v) => v || null),
});
