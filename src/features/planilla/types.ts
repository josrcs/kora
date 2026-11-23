import { z } from "zod";
import type { Escala } from "@/lib/grading/calc";

/* ------------------------------------------------------------------ */
/*  Datos que el servidor entrega a la planilla                        */
/* ------------------------------------------------------------------ */

export type OpcionAsignacion = {
  id: string;
  groupId: string;
  grupo: string;
  grado: string;
  gradoCodigo: number;
  asignatura: string;
  intensidadHoraria: number;
  estudiantes: number;
  docente: string;
};

export type OpcionPeriodo = {
  id: string;
  numero: number;
  nombre: string;
  porcentaje: number;
  fechaInicio: string;
  fechaFin: string;
  fechaLimiteNotas: string | null;
  fechaCorte: string | null;
  cerrado: boolean;
  cerradoAt: string | null;
  /** Cerrado y con el periodo siguiente ya empezado y abierto: se registra recuperación. */
  ventanaRecuperacion: boolean;
};

export type ActividadPlanilla = { id: string; nombre: string; porcentaje: number; orden: number };

/** Logro curricular del periodo (solo descripción: aparece en el boletín, no se califica). */
export type LogroPlanilla = { id: string; codigo: string; descripcion: string };

export type FilaPlanilla = {
  enrollmentId: string;
  studentId: string;
  documento: string;
  nombre: string;
  /** Notas por id de actividad. */
  notas: Record<string, number>;
  /** Definitiva guardada (calculada por el servidor desde las actividades, o digitada si no hay actividades). */
  nota: number | null;
  notaRecuperacion: number | null;
  fallas: number;
  observacion: string;
  /** Nota parcial en el corte preventivo del periodo (si ya se hizo). */
  corte: number | null;
};

/**
 *  - edicion: periodo abierto y el usuario puede calificar.
 *  - recuperacion: periodo cerrado en su ventana: solo la columna de recuperación de quienes perdieron.
 *  - lectura: cerrado fuera de ventana, o sin permiso.
 */
export type ModoPlanilla = "edicion" | "recuperacion" | "lectura";

export type PlanillaData = {
  asignacion: OpcionAsignacion;
  periodo: OpcionPeriodo;
  escala: Escala;
  topeRecuperacion: number;
  actividades: ActividadPlanilla[];
  logros: LogroPlanilla[];
  filas: FilaPlanilla[];
  modo: ModoPlanilla;
  /** Por qué no se puede editar (periodo cerrado, solo lectura por rol…). */
  motivoBloqueo: string | null;
  corte: { realizadoAt: string } | null;
  /** 0008: hay asistencia diaria registrada; las fallas se calculan desde ella y no se digitan. */
  fallasDesdeAsistencia: boolean;
};

/* ------------------------------------------------------------------ */
/*  Guardado: el cliente envía solo las celdas que cambiaron           */
/* ------------------------------------------------------------------ */

const uuid = z.uuid();
const nota = z.number().min(0).max(9.99).nullable();

export const cambioSchema = z.discriminatedUnion("campo", [
  z.object({ campo: z.literal("actividad"), enrollmentId: uuid, activityId: uuid, valor: nota }),
  z.object({ campo: z.literal("nota"), enrollmentId: uuid, valor: nota }),
  z.object({ campo: z.literal("fallas"), enrollmentId: uuid, valor: z.number().int().min(0).max(500) }),
  z.object({ campo: z.literal("observacion"), enrollmentId: uuid, valor: z.string().max(1000) }),
  z.object({ campo: z.literal("recuperacion"), enrollmentId: uuid, valor: nota }),
]);

export const guardarSchema = z.object({
  assignmentId: uuid,
  periodId: uuid,
  cambios: z.array(cambioSchema).min(1).max(2000),
});

export type Cambio = z.infer<typeof cambioSchema>;
export type GuardarInput = z.infer<typeof guardarSchema>;

export type GuardarResultado =
  | {
      ok: true;
      guardadoEn: string;
      /** Definitiva recalculada por el servidor para cada fila afectada. */
      definitivas: Record<string, number | null>;
    }
  | {
      ok: false;
      codigo: "SIN_SESION" | "SIN_PERMISO" | "PERIODO_CERRADO" | "VALIDACION" | "ERROR";
      error: string;
    };

/* ------------------------------------------------------------------ */
/*  Actividades                                                        */
/* ------------------------------------------------------------------ */
export const actividadSchema = z.object({
  assignmentId: uuid,
  periodId: uuid,
  nombre: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(60, "Máximo 60 caracteres."),
  porcentaje: z.coerce
    .number({ error: "Porcentaje inválido." })
    .gt(0, "El porcentaje debe ser mayor que 0.")
    .max(100, "Máximo 100 %.")
    .refine((n) => Math.round(n * 100) === n * 100, "Máximo dos decimales."),
});
export const editarActividadSchema = actividadSchema.omit({ assignmentId: true, periodId: true }).extend({ id: uuid });

export type EstadoActividad = { ok: boolean; error: string | null };
