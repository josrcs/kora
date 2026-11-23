import { z } from "zod";

export type AvanceTotal = { celdas: number; conNota: number; pendientes: number };

export type EventoPeriodo = {
  accion: "CIERRE" | "REAPERTURA";
  motivo: string | null;
  pendientes: number;
  actor: string;
  fecha: string; // ISO
};

export type PeriodoGestion = {
  id: string;
  numero: number;
  nombre: string;
  porcentaje: number;
  fechaInicio: string;
  fechaFin: string;
  fechaLimiteNotas: string | null;
  cerrado: boolean;
  cerradoAt: string | null;
  cerradoPor: string | null;
  avance: AvanceTotal;
  historial: EventoPeriodo[];
};

export type AnioGestion = { id: string; anio: number; fechaInicio: string | null; fechaFin: string | null };

/** Una asignación (docente · grupo · asignatura) con su avance de digitación en un periodo. */
export type AvanceAsignacion = {
  assignmentId: string;
  teacherId: string;
  docente: string;
  grupo: string;
  gradoCodigo: number;
  asignatura: string;
  estudiantes: number;
  conNota: number;
  pendientes: number;
  ultimaEdicion: string | null; // ISO
};

export type EstadoAvance = "al-dia" | "en-curso" | "sin-empezar" | "sin-estudiantes";

export function estadoAvance(a: { estudiantes: number; conNota: number }): EstadoAvance {
  if (a.estudiantes === 0) return "sin-estudiantes";
  if (a.conNota >= a.estudiantes) return "al-dia";
  return a.conNota === 0 ? "sin-empezar" : "en-curso";
}

/* ------------------------------------------------------------------ */
/*  Acciones                                                           */
/* ------------------------------------------------------------------ */
export type EstadoAccion = { ok: boolean; error: string | null; mensaje?: string };
export const estadoInicial: EstadoAccion = { ok: false, error: null };

const fecha = z.iso.date({ error: "Fecha inválida." });

export const cerrarSchema = z.object({
  periodId: z.uuid(),
  /** El total de pendientes que vio quien cierra: si cambió mientras tanto, se vuelve a confirmar. */
  pendientesVistos: z.coerce.number().int().min(0),
  confirmarPendientes: z.literal("on").optional(),
});

export const reabrirSchema = z.object({
  periodId: z.uuid(),
  motivo: z
    .string()
    .trim()
    .min(10, "Explique el motivo con al menos 10 caracteres (queda en el historial).")
    .max(500, "Máximo 500 caracteres."),
});

export const fechasSchema = z
  .object({
    periodId: z.uuid(),
    fechaInicio: fecha,
    fechaFin: fecha,
    fechaLimiteNotas: z.union([z.literal(""), fecha]).transform((v) => v || null),
  })
  .refine((d) => d.fechaFin >= d.fechaInicio, { message: "La fecha de fin debe ser posterior al inicio.", path: ["fechaFin"] })
  .refine((d) => !d.fechaLimiteNotas || d.fechaLimiteNotas >= d.fechaInicio, {
    message: "El plazo de notas no puede ser anterior al inicio del periodo.",
    path: ["fechaLimiteNotas"],
  });
