/**
 * Espejo tipado del esquema para Drizzle ORM.
 *
 * La fuente de verdad es `db/migrations/*.sql` (constraints, triggers, RLS,
 * vistas). Este archivo solo describe columnas y claves para que las
 * consultas sean tipadas; si cambias una migración, actualiza aquí.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  date,
  inet,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/*  Enums                                                              */
/* ------------------------------------------------------------------ */
export const rolUsuario = pgEnum("rol_usuario", ["ADMIN", "RECTOR", "COORDINATOR", "TEACHER", "STUDENT", "GUARDIAN"]);
export const tipoDocumento = pgEnum("tipo_documento", ["RC", "TI", "CC", "CE", "NUIP", "PPT", "PA"]);
export const nivelEducativo = pgEnum("nivel_educativo", ["PREESCOLAR", "BASICA_PRIMARIA", "BASICA_SECUNDARIA", "MEDIA"]);
export const jornada = pgEnum("jornada", ["MANANA", "TARDE", "NOCHE", "UNICA", "FIN_DE_SEMANA"]);
export const estadoMatricula = pgEnum("estado_matricula", ["ACTIVA", "RETIRADA", "TRASLADADA"]);
export const desempeno = pgEnum("desempeno", ["SUPERIOR", "ALTO", "BASICO", "BAJO"]);
export const dimensionLogro = pgEnum("dimension_logro", ["COGNITIVA", "PROCEDIMENTAL", "ACTITUDINAL"]);
export const tipoAnotacion = pgEnum("tipo_anotacion", ["ACADEMICA", "DISCIPLINARIA", "CONVIVENCIA", "FELICITACION", "COMPROMISO"]);
export const situacionLey1620 = pgEnum("situacion_ley1620", ["TIPO_I", "TIPO_II", "TIPO_III"]);
export const accionPeriodo = pgEnum("accion_periodo", ["CIERRE", "REAPERTURA"]);
export const estadoProceso = pgEnum("estado_proceso", ["ABIERTO", "CERRADO"]);

export type Rol = (typeof rolUsuario.enumValues)[number];
export type Desempeno = (typeof desempeno.enumValues)[number];

/* Columnas comunes */
const id = () => uuid("id").primaryKey().defaultRandom();
const tenant = () => uuid("institution_id").notNull();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
/** Notas: NUMERIC(3,2). Se leen como number; los cálculos se hacen en centésimas enteras. */
const nota = (name: string) => numeric(name, { precision: 3, scale: 2, mode: "number" });

/* ------------------------------------------------------------------ */
/*  Institución y usuarios                                             */
/* ------------------------------------------------------------------ */
export const institutions = pgTable("institutions", {
  id: id(),
  nombre: varchar("nombre", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 60 }).notNull().unique(),
  codigoDane: char("codigo_dane", { length: 12 }).notNull().unique(),
  nit: varchar("nit", { length: 15 }),
  municipio: varchar("municipio", { length: 80 }).notNull(),
  departamento: varchar("departamento", { length: 80 }).notNull(),
  direccion: varchar("direccion", { length: 160 }),
  telefono: varchar("telefono", { length: 30 }),
  resolucion: varchar("resolucion", { length: 200 }),
  logoUrl: text("logo_url"),
  escalaMin: nota("escala_min").notNull(),
  escalaMax: nota("escala_max").notNull(),
  notaAprobatoria: nota("nota_aprobatoria").notNull(),
  decimalesNota: smallint("decimales_nota").notNull(),
  /** 0006: tope de la nota de recuperación (por defecto 3.0). */
  notaMaxRecuperacion: nota("nota_max_recuperacion").notNull(),
  activo: boolean("activo").notNull().default(true),
  /** Generada: nombre + municipio + departamento en minúsculas y sin tildes. */
  busqueda: text("busqueda").generatedAlwaysAs(
    sql`translate(lower(nombre || ' ' || municipio || ' ' || departamento), 'áéíóúüñ', 'aeiouun')`,
  ),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const loginAttempts = pgTable("login_attempts", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  institutionId: tenant(),
  documento: varchar("documento", { length: 20 }).notNull(),
  userId: uuid("user_id"),
  ip: inet("ip"),
  exitoso: boolean("exitoso").notNull(),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    institutionId: tenant(),
    tipoDocumento: tipoDocumento("tipo_documento").notNull().default("CC"),
    documentoIdentidad: varchar("documento_identidad", { length: 20 }).notNull(),
    nombres: varchar("nombres", { length: 80 }).notNull(),
    apellidos: varchar("apellidos", { length: 80 }).notNull(),
    nombreCompleto: varchar("nombre_completo", { length: 161 }).generatedAlwaysAs(sql`apellidos || ' ' || nombres`),
    email: varchar("email", { length: 160 }),
    telefono: varchar("telefono", { length: 20 }),
    passwordHash: text("password_hash").notNull(),
    rol: rolUsuario("rol").notNull(),
    activo: boolean("activo").notNull().default(true),
    debeCambiarPassword: boolean("debe_cambiar_password").notNull().default(true),
    ultimoAccesoAt: timestamp("ultimo_acceso_at", { withTimezone: true }),
    sesionVersion: integer("sesion_version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("users_documento_uq").on(t.institutionId, t.documentoIdentidad)],
);

export const performanceLevels = pgTable("performance_levels", {
  id: id(),
  institutionId: tenant(),
  desempeno: desempeno("desempeno").notNull(),
  notaDesde: nota("nota_desde").notNull(),
  notaHasta: nota("nota_hasta").notNull(),
});

/* ------------------------------------------------------------------ */
/*  Calendario académico                                               */
/* ------------------------------------------------------------------ */
export const academicYears = pgTable("academic_years", {
  id: id(),
  institutionId: tenant(),
  anio: smallint("anio").notNull(),
  fechaInicio: date("fecha_inicio"),
  fechaFin: date("fecha_fin"),
  activo: boolean("activo").notNull().default(false),
  createdAt: createdAt(),
});

export const periods = pgTable("periods", {
  id: id(),
  institutionId: tenant(),
  academicYearId: uuid("academic_year_id").notNull(),
  numero: smallint("numero").notNull(),
  nombre: varchar("nombre", { length: 40 }).notNull(),
  porcentaje: numeric("porcentaje", { precision: 5, scale: 2, mode: "number" }).notNull(),
  fechaInicio: date("fecha_inicio").notNull(),
  fechaFin: date("fecha_fin").notNull(),
  fechaLimiteNotas: date("fecha_limite_notas"),
  /** 0006: fecha del corte preventivo (mitad del periodo). */
  fechaCorte: date("fecha_corte"),
  cerrado: boolean("cerrado").notNull().default(false),
  cerradoAt: timestamp("cerrado_at", { withTimezone: true }),
  cerradoPor: uuid("cerrado_por"),
});

/** 0003: historial de cierres y reaperturas de periodos. */
export const periodEvents = pgTable("period_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  institutionId: tenant(),
  periodId: uuid("period_id").notNull(),
  accion: accionPeriodo("accion").notNull(),
  motivo: varchar("motivo", { length: 500 }),
  pendientes: integer("pendientes").notNull().default(0),
  actorId: uuid("actor_id").notNull(),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/*  Estructura: grados, grupos, áreas, asignaturas, carga académica    */
/* ------------------------------------------------------------------ */
export const gradeLevels = pgTable("grade_levels", {
  id: id(),
  institutionId: tenant(),
  codigo: smallint("codigo").notNull(),
  nombre: varchar("nombre", { length: 30 }).notNull(),
  nivel: nivelEducativo("nivel").notNull(),
});

export const groups = pgTable("groups", {
  id: id(),
  institutionId: tenant(),
  academicYearId: uuid("academic_year_id").notNull(),
  gradeLevelId: uuid("grade_level_id").notNull(),
  codigo: varchar("codigo", { length: 10 }).notNull(),
  jornada: jornada("jornada").notNull().default("UNICA"),
  directorId: uuid("director_id"),
  capacidad: smallint("capacidad"),
});

export const areas = pgTable("areas", {
  id: id(),
  institutionId: tenant(),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  orden: smallint("orden").notNull().default(0),
});

export const subjects = pgTable("subjects", {
  id: id(),
  institutionId: tenant(),
  areaId: uuid("area_id").notNull(),
  nombre: varchar("nombre", { length: 100 }).notNull(),
  abreviatura: varchar("abreviatura", { length: 8 }).notNull(),
  activo: boolean("activo").notNull().default(true),
});

export const teacherAssignments = pgTable(
  "teacher_assignments",
  {
    id: id(),
    institutionId: tenant(),
    groupId: uuid("group_id").notNull(),
    subjectId: uuid("subject_id").notNull(),
    teacherId: uuid("teacher_id").notNull(),
    intensidadHoraria: smallint("intensidad_horaria").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("teacher_assignments_uq").on(t.groupId, t.subjectId)],
);

/* ------------------------------------------------------------------ */
/*  Matrícula y acudientes                                             */
/* ------------------------------------------------------------------ */
export const enrollments = pgTable(
  "enrollments",
  {
    id: id(),
    institutionId: tenant(),
    academicYearId: uuid("academic_year_id").notNull(),
    groupId: uuid("group_id").notNull(),
    studentId: uuid("student_id").notNull(),
    estado: estadoMatricula("estado").notNull().default("ACTIVA"),
    fechaMatricula: date("fecha_matricula").notNull(),
    fechaRetiro: date("fecha_retiro"),
    motivoRetiro: varchar("motivo_retiro", { length: 300 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("enrollments_anio_uq").on(t.studentId, t.academicYearId)],
);

export const studentGuardians = pgTable(
  "student_guardians",
  {
    institutionId: tenant(),
    studentId: uuid("student_id").notNull(),
    guardianId: uuid("guardian_id").notNull(),
    parentesco: varchar("parentesco", { length: 30 }).notNull(),
    esPrincipal: boolean("es_principal").notNull().default(false),
    puedeVerNotas: boolean("puede_ver_notas").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.guardianId] })],
);

/* ------------------------------------------------------------------ */
/*  Evaluación                                                         */
/* ------------------------------------------------------------------ */
export const achievements = pgTable(
  "achievements",
  {
    id: id(),
    institutionId: tenant(),
    periodId: uuid("period_id").notNull(),
    subjectId: uuid("subject_id").notNull(),
    gradeLevelId: uuid("grade_level_id").notNull(),
    codigo: varchar("codigo", { length: 10 }).notNull(),
    descripcion: varchar("descripcion", { length: 600 }).notNull(),
    dimension: dimensionLogro("dimension"),
    porcentaje: numeric("porcentaje", { precision: 5, scale: 2, mode: "number" }).notNull(),
    orden: smallint("orden").notNull().default(1),
    createdBy: uuid("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("achievements_codigo_uq").on(t.periodId, t.subjectId, t.gradeLevelId, t.codigo)],
);

export const achievementScores = pgTable(
  "achievement_scores",
  {
    id: id(),
    institutionId: tenant(),
    enrollmentId: uuid("enrollment_id").notNull(),
    achievementId: uuid("achievement_id").notNull(),
    nota: nota("nota").notNull(),
    updatedBy: uuid("updated_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("achievement_scores_uq").on(t.enrollmentId, t.achievementId)],
);

export const grades = pgTable(
  "grades",
  {
    id: id(),
    institutionId: tenant(),
    enrollmentId: uuid("enrollment_id").notNull(),
    teacherAssignmentId: uuid("teacher_assignment_id").notNull(),
    periodId: uuid("period_id").notNull(),
    nota: nota("nota"),
    fallas: smallint("fallas").notNull().default(0),
    fallasJustificadas: smallint("fallas_justificadas").notNull().default(0),
    observacion: varchar("observacion", { length: 1000 }),
    updatedBy: uuid("updated_by").notNull(),
    /** 0006: recuperación (solo en la ventana del periodo siguiente, con tope institucional). */
    notaRecuperacion: nota("nota_recuperacion"),
    recuperadaAt: timestamp("recuperada_at", { withTimezone: true }),
    recuperadaPor: uuid("recuperada_por"),
    /** Generada: coalesce(nota_recuperacion, nota). Es la que vale en boletines y reportes. */
    notaFinal: nota("nota_final").generatedAlwaysAs(sql`coalesce(nota_recuperacion, nota)`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("grades_uq").on(t.enrollmentId, t.teacherAssignmentId, t.periodId)],
);

/** 0006: actividades calificables que el docente crea en su planilla. */
export const activities = pgTable(
  "activities",
  {
    id: id(),
    institutionId: tenant(),
    teacherAssignmentId: uuid("teacher_assignment_id").notNull(),
    periodId: uuid("period_id").notNull(),
    nombre: varchar("nombre", { length: 60 }).notNull(),
    porcentaje: numeric("porcentaje", { precision: 5, scale: 2, mode: "number" }).notNull(),
    orden: smallint("orden").notNull().default(1),
    createdBy: uuid("created_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("activities_nombre_uq").on(t.teacherAssignmentId, t.periodId, t.nombre)],
);

export const activityScores = pgTable(
  "activity_scores",
  {
    institutionId: tenant(),
    activityId: uuid("activity_id").notNull(),
    enrollmentId: uuid("enrollment_id").notNull(),
    nota: nota("nota").notNull(),
    updatedBy: uuid("updated_by").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.activityId, t.enrollmentId] })],
);

export const preventiveCuts = pgTable("preventive_cuts", {
  id: id(),
  institutionId: tenant(),
  periodId: uuid("period_id").notNull(),
  realizadoAt: timestamp("realizado_at", { withTimezone: true }).notNull().defaultNow(),
  realizadoPor: uuid("realizado_por").notNull(),
});

export const preventiveCutGrades = pgTable(
  "preventive_cut_grades",
  {
    institutionId: tenant(),
    cutId: uuid("cut_id").notNull(),
    enrollmentId: uuid("enrollment_id").notNull(),
    teacherAssignmentId: uuid("teacher_assignment_id").notNull(),
    nota: nota("nota"),
  },
  (t) => [primaryKey({ columns: [t.cutId, t.enrollmentId, t.teacherAssignmentId] })],
);

export const studentObserver = pgTable("student_observer", {
  id: id(),
  institutionId: tenant(),
  studentId: uuid("student_id").notNull(),
  enrollmentId: uuid("enrollment_id").notNull(),
  autorId: uuid("autor_id").notNull(),
  fecha: date("fecha").notNull(),
  tipo: tipoAnotacion("tipo").notNull(),
  situacion: situacionLey1620("situacion"),
  descripcion: varchar("descripcion", { length: 4000 }).notNull(),
  accionPedagogica: varchar("accion_pedagogica", { length: 2000 }),
  descargos: varchar("descargos", { length: 4000 }),
  descargosAt: timestamp("descargos_at", { withTimezone: true }),
  acudienteId: uuid("acudiente_id"),
  acudienteConfirmadoAt: timestamp("acudiente_confirmado_at", { withTimezone: true }),
  acudienteIp: inet("acudiente_ip"),
  /** 0005: proceso disciplinario (NULL = anotación simple). */
  proceso: estadoProceso("proceso"),
  conclusion: varchar("conclusion", { length: 2000 }),
  cerradoAt: timestamp("cerrado_at", { withTimezone: true }),
  cerradoPor: uuid("cerrado_por"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const auditLog = pgTable("audit_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  institutionId: tenant(),
  tabla: text("tabla").notNull(),
  registroId: uuid("registro_id").notNull(),
  accion: char("accion", { length: 1 }).notNull(),
  actorId: uuid("actor_id"),
  antes: jsonb("antes"),
  despues: jsonb("despues"),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/*  0007 · Convivencia, avisos y autorización de datos                 */
/* ------------------------------------------------------------------ */
export const audienciaAviso = pgEnum("audiencia_aviso", ["TODOS", "ESTUDIANTES", "ACUDIENTES"]);
export const tipoAviso = pgEnum("tipo_aviso", ["AVISO", "COMUNICADO", "URGENTE"]);
export const tipoConsentimiento = pgEnum("tipo_consentimiento", ["ACEPTACION_USUARIO", "AUTORIZACION_REPRESENTANTE"]);
export type AudienciaAviso = (typeof audienciaAviso.enumValues)[number];
export type TipoAviso = (typeof tipoAviso.enumValues)[number];

/** Nota de convivencia por estudiante y periodo (coordinación o director de grupo). */
export const convivenciaGrades = pgTable(
  "convivencia_grades",
  {
    id: id(),
    institutionId: tenant(),
    enrollmentId: uuid("enrollment_id").notNull(),
    periodId: uuid("period_id").notNull(),
    nota: nota("nota").notNull(),
    observacion: varchar("observacion", { length: 1000 }),
    updatedBy: uuid("updated_by").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("convivencia_grades_uq").on(t.enrollmentId, t.periodId)],
);

export const announcements = pgTable("announcements", {
  id: id(),
  institutionId: tenant(),
  autorId: uuid("autor_id").notNull(),
  tipo: tipoAviso("tipo").notNull().default("AVISO"),
  audiencia: audienciaAviso("audiencia").notNull().default("TODOS"),
  titulo: varchar("titulo", { length: 140 }).notNull(),
  cuerpo: varchar("cuerpo", { length: 5000 }).notNull(),
  fijado: boolean("fijado").notNull().default(false),
  archivadoAt: timestamp("archivado_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const announcementReads = pgTable(
  "announcement_reads",
  {
    institutionId: tenant(),
    announcementId: uuid("announcement_id").notNull(),
    userId: uuid("user_id").notNull(),
    leidoAt: timestamp("leido_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.announcementId, t.userId] })],
);

/** Registro inmutable de aceptaciones, rechazos y revocatorias de la política de datos. */
export const dataConsents = pgTable("data_consents", {
  id: id(),
  institutionId: tenant(),
  userId: uuid("user_id").notNull(),
  tipo: tipoConsentimiento("tipo").notNull(),
  version: varchar("version", { length: 20 }).notNull(),
  aceptado: boolean("aceptado").notNull(),
  representanteNombre: varchar("representante_nombre", { length: 161 }),
  representanteDocumento: varchar("representante_documento", { length: 20 }),
  representanteParentesco: varchar("representante_parentesco", { length: 40 }),
  registradoPor: uuid("registrado_por").notNull(),
  ip: inet("ip"),
  userAgent: varchar("user_agent", { length: 300 }),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/*  0008 · Asistencia diaria                                           */
/* ------------------------------------------------------------------ */
export const estadoAsistencia = pgEnum("estado_asistencia", ["PRESENTE", "AUSENTE", "TARDE", "EXCUSA"]);
export type EstadoAsistencia = (typeof estadoAsistencia.enumValues)[number];

/** Una clase dictada: asignación + fecha (la base recalcula grades.fallas con cada cambio). */
export const attendanceSessions = pgTable(
  "attendance_sessions",
  {
    id: id(),
    institutionId: tenant(),
    teacherAssignmentId: uuid("teacher_assignment_id").notNull(),
    periodId: uuid("period_id").notNull(),
    fecha: date("fecha").notNull(),
    horas: smallint("horas").notNull().default(1),
    tema: varchar("tema", { length: 200 }),
    registradoPor: uuid("registrado_por").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("attendance_sessions_dia_uq").on(t.teacherAssignmentId, t.fecha)],
);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    institutionId: tenant(),
    sessionId: uuid("session_id").notNull(),
    enrollmentId: uuid("enrollment_id").notNull(),
    estado: estadoAsistencia("estado").notNull().default("PRESENTE"),
    observacion: varchar("observacion", { length: 300 }),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.enrollmentId] })],
);
