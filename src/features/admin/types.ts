import { z } from "zod";

/** Respuesta común de las acciones de administración. `secreto` se muestra una sola vez (claves temporales). */
export type EstadoForm = { ok: boolean; error: string | null; mensaje?: string; secreto?: { etiqueta: string; valor: string }[] };
export const estadoFormInicial: EstadoForm = { ok: false, error: null };

const fecha = z.iso.date({ error: "Fecha inválida." });
const fechaOpcional = z.union([z.literal(""), fecha]).transform((v) => v || null);
const texto = (min: number, max: number, campo: string) =>
  z
    .string()
    .trim()
    .min(min, `${campo}: mínimo ${min} caracteres.`)
    .max(max, `${campo}: máximo ${max} caracteres.`);
const entero = (min: number, max: number, campo: string) =>
  z.coerce
    .number({ error: `${campo} inválido.` })
    .int(`${campo} debe ser entero.`)
    .min(min, `${campo}: mínimo ${min}.`)
    .max(max, `${campo}: máximo ${max}.`);
const porcentaje = z.coerce
  .number({ error: "Porcentaje inválido." })
  .gt(0, "El porcentaje debe ser mayor que 0.")
  .max(100, "El porcentaje no puede pasar de 100.")
  .refine((n) => Math.round(n * 100) === n * 100, "Máximo dos decimales en el porcentaje.");

/* ---------------- Años y periodos ---------------- */
export const anioSchema = z
  .object({
    anio: entero(2000, 2100, "El año"),
    fechaInicio: fecha,
    fechaFin: fecha,
    periodos: entero(0, 6, "El número de periodos"),
  })
  .refine((d) => d.fechaFin > d.fechaInicio, { message: "La fecha de fin debe ser posterior al inicio." })
  .refine((d) => d.fechaInicio.startsWith(String(d.anio)), { message: "El año lectivo debe empezar en el año indicado." });

export const idSchema = z.object({ id: z.uuid() });

export const periodoSchema = z
  .object({
    academicYearId: z.uuid(),
    nombre: texto(3, 40, "Nombre"),
    porcentaje,
    fechaInicio: fecha,
    fechaFin: fecha,
    fechaLimiteNotas: fechaOpcional,
  })
  .refine((d) => d.fechaFin >= d.fechaInicio, { message: "La fecha de fin debe ser posterior al inicio." });

export const editarPeriodoSchema = z
  .object({
    id: z.uuid(),
    nombre: texto(3, 40, "Nombre"),
    porcentaje,
    fechaInicio: fecha,
    fechaFin: fecha,
    fechaLimiteNotas: fechaOpcional,
  })
  .refine((d) => d.fechaFin >= d.fechaInicio, { message: "La fecha de fin debe ser posterior al inicio." });

/* ---------------- Estructura ---------------- */
export const NIVELES = ["PREESCOLAR", "BASICA_PRIMARIA", "BASICA_SECUNDARIA", "MEDIA"] as const;
export const NIVEL_LABEL: Record<(typeof NIVELES)[number], string> = {
  PREESCOLAR: "Preescolar",
  BASICA_PRIMARIA: "Básica primaria",
  BASICA_SECUNDARIA: "Básica secundaria",
  MEDIA: "Media",
};

/** Grados del sistema educativo colombiano (Ley 115): código, nombre y nivel. */
export const GRADOS_ESTANDAR: { codigo: number; nombre: string; nivel: (typeof NIVELES)[number] }[] = [
  { codigo: -2, nombre: "Prejardín", nivel: "PREESCOLAR" },
  { codigo: -1, nombre: "Jardín", nivel: "PREESCOLAR" },
  { codigo: 0, nombre: "Transición", nivel: "PREESCOLAR" },
  ...[1, 2, 3, 4, 5].map((c) => ({ codigo: c, nombre: `${c}°`, nivel: "BASICA_PRIMARIA" as const })),
  ...[6, 7, 8, 9].map((c) => ({ codigo: c, nombre: `${c}°`, nivel: "BASICA_SECUNDARIA" as const })),
  ...[10, 11, 12, 13].map((c) => ({ codigo: c, nombre: `${c}°`, nivel: "MEDIA" as const })),
];

export const gradoSchema = z.object({ codigo: entero(-2, 13, "El grado") });

export const areaSchema = z.object({ nombre: texto(3, 120, "Nombre del área"), orden: entero(0, 99, "El orden") });
export const editarAreaSchema = areaSchema.extend({ id: z.uuid() });

export const asignaturaSchema = z.object({
  areaId: z.uuid({ error: "Seleccione el área." }),
  nombre: texto(3, 100, "Nombre de la asignatura"),
  abreviatura: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-ZÁÉÍÓÚÑ0-9]{2,8}$/, "Abreviatura: de 2 a 8 letras o números, sin espacios."),
});
export const editarAsignaturaSchema = asignaturaSchema.extend({ id: z.uuid(), activo: z.enum(["true", "false"]).transform((v) => v === "true") });

/* ---------------- Grupos ---------------- */
export const JORNADAS = ["MANANA", "TARDE", "NOCHE", "UNICA", "FIN_DE_SEMANA"] as const;
export const JORNADA_LABEL: Record<(typeof JORNADAS)[number], string> = {
  MANANA: "Mañana",
  TARDE: "Tarde",
  NOCHE: "Noche",
  UNICA: "Única",
  FIN_DE_SEMANA: "Fin de semana",
};

export const grupoSchema = z.object({
  academicYearId: z.uuid(),
  gradeLevelId: z.uuid({ error: "Seleccione el grado." }),
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9A-Z]{1,4}-?[0-9A-Z]{0,5}$/, "Código del grupo: por ejemplo 6-01, 601 o 11-A (máximo 10 caracteres)."),
  jornada: z.enum(JORNADAS),
  capacidad: z.union([z.literal(""), entero(1, 60, "La capacidad")]).transform((v) => (v === "" ? null : v)),
});
export const editarGrupoSchema = grupoSchema.omit({ academicYearId: true, gradeLevelId: true }).extend({ id: z.uuid() });

/* ---------------- Matrículas ---------------- */
export const TIPOS_DOCUMENTO = ["RC", "TI", "CC", "CE", "NUIP", "PPT", "PA"] as const;

const documento = z
  .string()
  .transform((v) => v.replace(/[.\s]/g, ""))
  .pipe(z.string().regex(/^[0-9A-Za-z-]{4,20}$/, "Documento inválido: de 4 a 20 letras, números o guiones."));
const nombre = (campo: string) => texto(2, 80, campo);

export const buscarPersonaSchema = z.object({ documento });

export const matriculaSchema = z
  .object({
    groupId: z.uuid(),
    fechaMatricula: fecha,
    tipoDocumento: z.enum(TIPOS_DOCUMENTO),
    documento,
    nombres: nombre("Nombres"),
    apellidos: nombre("Apellidos"),
    acudienteDocumento: z.union([z.literal(""), documento]),
    acudienteTipoDocumento: z.enum(TIPOS_DOCUMENTO),
    acudienteNombres: z.string().trim().max(80),
    acudienteApellidos: z.string().trim().max(80),
    acudienteParentesco: z.string().trim().max(30),
    acudienteTelefono: z
      .string()
      .trim()
      .regex(/^[0-9 +()-]{0,20}$/, "Teléfono inválido."),
    /* Autorización de tratamiento de datos del menor (art. 7 Ley 1581 de 2012; art. 12 Decreto 1377 de 2013). */
    autorizacionDatos: z.literal("on", {
      error: "Sin la autorización del representante legal no se puede crear la cuenta del estudiante (Ley 1581 de 2012).",
    }),
    representanteNombre: texto(5, 161, "Nombre del representante legal"),
    representanteDocumento: documento,
    representanteParentesco: texto(3, 40, "Parentesco del representante legal"),
  })
  .refine((d) => !d.acudienteDocumento || d.acudienteDocumento !== d.documento, {
    message: "El acudiente no puede tener el mismo documento del estudiante.",
  })
  .refine((d) => !d.acudienteDocumento || d.acudienteParentesco.length >= 3, { message: "Indique el parentesco del acudiente." });

export const trasladoSchema = z.object({ enrollmentId: z.uuid(), groupId: z.uuid({ error: "Seleccione el grupo destino." }) });

export const retiroSchema = z.object({
  enrollmentId: z.uuid(),
  estado: z.enum(["RETIRADA", "TRASLADADA"]),
  fechaRetiro: fecha,
  motivo: texto(5, 300, "Motivo"),
});
