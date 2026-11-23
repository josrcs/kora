import { z } from "zod";

export const TIPOS_ANOTACION = ["DISCIPLINARIA", "CONVIVENCIA", "ACADEMICA", "COMPROMISO", "FELICITACION"] as const;
export const SITUACIONES = ["TIPO_I", "TIPO_II", "TIPO_III"] as const;

export type EstadoConvivencia = { ok: boolean; error: string | null; mensaje?: string };
export const estadoConvivenciaInicial: EstadoConvivencia = { ok: false, error: null };

export const anotacionSchema = z
  .object({
    studentId: z.uuid(),
    fecha: z.iso.date({ error: "Fecha inválida." }),
    tipo: z.enum(TIPOS_ANOTACION),
    situacion: z.union([z.literal(""), z.enum(SITUACIONES)]).transform((v) => v || null),
    descripcion: z.string().trim().min(10, "Describa los hechos con al menos 10 caracteres.").max(4000, "Máximo 4000 caracteres."),
    accionPedagogica: z
      .string()
      .trim()
      .max(2000, "Máximo 2000 caracteres.")
      .transform((v) => v || null),
    abrirProceso: z.literal("on").optional(),
  })
  .refine((d) => !d.situacion || d.tipo === "DISCIPLINARIA" || d.tipo === "CONVIVENCIA", {
    message: "La situación (Ley 1620) solo aplica a anotaciones disciplinarias o de convivencia.",
  })
  .refine((d) => !d.abrirProceso || d.tipo === "DISCIPLINARIA" || d.tipo === "CONVIVENCIA", {
    message: "Solo se abre proceso sobre una anotación disciplinaria o de convivencia.",
  });

export const cerrarProcesoSchema = z.object({
  id: z.uuid(),
  conclusion: z.string().trim().min(10, "Escriba la conclusión del proceso (mínimo 10 caracteres).").max(2000, "Máximo 2000 caracteres."),
});

export type AnotacionConvivencia = {
  id: string;
  fecha: string;
  tipo: (typeof TIPOS_ANOTACION)[number];
  situacion: (typeof SITUACIONES)[number] | null;
  descripcion: string;
  accionPedagogica: string | null;
  autor: string;
  autorRol: string;
  descargos: string | null;
  firmadaPor: string | null;
  firmadaAt: string | null;
  proceso: "ABIERTO" | "CERRADO" | null;
  conclusion: string | null;
  cerradoPor: string | null;
  cerradoAt: string | null;
};
