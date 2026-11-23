import "server-only";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { withTenant, type Tx } from "@/db/client";
import {
  academicYears,
  announcementReads,
  announcements,
  enrollments,
  gradeLevels,
  groups,
  studentGuardians,
  users,
  type AudienciaAviso,
  type TipoAviso,
} from "@/db/schema";
import type { Session } from "@/lib/auth/session";

export type Aviso = {
  id: string;
  tipo: TipoAviso;
  audiencia: AudienciaAviso;
  titulo: string;
  cuerpo: string;
  fijado: boolean;
  autor: string;
  fecha: Date;
  /** "Todo el colegio", "Grado 9°" o "Curso 9-A". */
  alcance: string;
};
export type AvisoCoordinacion = Aviso & { leidos: number; destinatarios: number; archivado: boolean };
export type AvisoUsuario = Aviso & { leido: boolean };
export type OpcionesAlcance = { id: string; nombre: string; cursos: { id: string; codigo: string }[] }[];

const audienciasDe = (rol: Session["rol"]): AudienciaAviso[] =>
  rol === "STUDENT" ? ["TODOS", "ESTUDIANTES"] : rol === "GUARDIAN" ? ["TODOS", "ACUDIENTES"] : ["TODOS", "ESTUDIANTES", "ACUDIENTES"];

const grado = alias(gradeLevels, "grado_aviso");
const curso = alias(groups, "curso_aviso");

const columnas = {
  id: announcements.id,
  tipo: announcements.tipo,
  audiencia: announcements.audiencia,
  titulo: announcements.titulo,
  cuerpo: announcements.cuerpo,
  fijado: announcements.fijado,
  autor: users.nombreCompleto,
  fecha: announcements.createdAt,
  archivadoAt: announcements.archivadoAt,
  grado: grado.nombre,
  curso: curso.codigo,
};

const alcanceDe = (f: { grado: string | null; curso: string | null }) =>
  f.curso ? `Curso ${f.curso}` : f.grado ? `Grado ${f.grado}` : "Todo el colegio";

/** Grados del año activo con sus cursos, para elegir a quién va un aviso. */
export async function opcionesAlcance(session: Session): Promise<OpcionesAlcance> {
  return withTenant(session, async (tx) => {
    const filas = await tx
      .select({ gradoId: gradeLevels.id, grado: gradeLevels.nombre, codigoGrado: gradeLevels.codigo, cursoId: groups.id, curso: groups.codigo })
      .from(groups)
      .innerJoin(academicYears, and(eq(academicYears.id, groups.academicYearId), eq(academicYears.activo, true)))
      .innerJoin(gradeLevels, eq(gradeLevels.id, groups.gradeLevelId))
      .where(eq(groups.institutionId, session.institutionId))
      .orderBy(asc(gradeLevels.codigo), asc(groups.codigo));
    const grados = new Map<string, OpcionesAlcance[number]>();
    for (const f of filas) {
      const g = grados.get(f.gradoId) ?? { id: f.gradoId, nombre: f.grado, cursos: [] };
      g.cursos.push({ id: f.cursoId, codigo: f.curso });
      grados.set(f.gradoId, g);
    }
    return [...grados.values()];
  });
}

/** Para coordinación: todos los avisos con acuse de lectura (leídos / destinatarios reales según audiencia y alcance). */
export async function avisosDeCoordinacion(session: Session): Promise<AvisoCoordinacion[]> {
  return withTenant(session, async (tx) => {
    // Estudiantes y acudientes que alcanza cada aviso (matrícula activa del año activo, cuentas activas).
    const alcanzados = (rol: "est" | "acu") => sql<number>`(
      select count(distinct ${rol === "est" ? sql`e.student_id` : sql`sg.guardian_id`})::int
        from enrollments e
        join academic_years y on y.id = e.academic_year_id and y.activo
        join groups g on g.id = e.group_id
        join users u on u.id = e.student_id and u.activo
        ${rol === "acu" ? sql`join student_guardians sg on sg.student_id = e.student_id join users ga on ga.id = sg.guardian_id and ga.activo` : sql``}
       where e.institution_id = ${announcements.institutionId} and e.estado = 'ACTIVA'
         and (${announcements.gradeLevelId} is null or g.grade_level_id = ${announcements.gradeLevelId})
         and (${announcements.groupId} is null or e.group_id = ${announcements.groupId}))`;

    const filas = await tx
      .select({
        ...columnas,
        leidos: sql<number>`(select count(*)::int from announcement_reads r where r.announcement_id = ${announcements.id})`,
        estudiantes: alcanzados("est"),
        acudientes: alcanzados("acu"),
      })
      .from(announcements)
      .innerJoin(users, eq(users.id, announcements.autorId))
      .leftJoin(grado, eq(grado.id, announcements.gradeLevelId))
      .leftJoin(curso, eq(curso.id, announcements.groupId))
      .where(eq(announcements.institutionId, session.institutionId))
      .orderBy(desc(announcements.fijado), desc(announcements.createdAt))
      .limit(100);

    return filas.map((f) => ({
      ...f,
      autor: f.autor ?? "",
      alcance: alcanceDe(f),
      destinatarios: f.audiencia === "ESTUDIANTES" ? f.estudiantes : f.audiencia === "ACUDIENTES" ? f.acudientes : f.estudiantes + f.acudientes,
      archivado: f.archivadoAt !== null,
    }));
  });
}

/** Grados y cursos (año activo) del estudiante, o de los estudiantes a cargo del acudiente. */
async function ubicacionDelUsuario(tx: Tx, session: Session) {
  const base = tx
    .select({ grupo: enrollments.groupId, grado: groups.gradeLevelId })
    .from(enrollments)
    .innerJoin(academicYears, and(eq(academicYears.id, enrollments.academicYearId), eq(academicYears.activo, true)))
    .innerJoin(groups, eq(groups.id, enrollments.groupId));
  const filas =
    session.rol === "STUDENT"
      ? await base.where(and(eq(enrollments.studentId, session.userId), eq(enrollments.estado, "ACTIVA")))
      : await base
          .innerJoin(studentGuardians, and(eq(studentGuardians.studentId, enrollments.studentId), eq(studentGuardians.guardianId, session.userId)))
          .where(eq(enrollments.estado, "ACTIVA"));
  return { grupos: [...new Set(filas.map((f) => f.grupo))], grados: [...new Set(filas.map((f) => f.grado))] };
}

/** Para estudiantes y acudientes: avisos vigentes dirigidos a su perfil y a su grado o curso, con marca de leído. */
export async function avisosParaUsuario(session: Session, limite = 50): Promise<AvisoUsuario[]> {
  return withTenant(session, async (tx) => {
    const { grupos, grados } = await ubicacionDelUsuario(tx, session);
    const filas = await tx
      .select({ ...columnas, leidoAt: announcementReads.leidoAt })
      .from(announcements)
      .innerJoin(users, eq(users.id, announcements.autorId))
      .leftJoin(grado, eq(grado.id, announcements.gradeLevelId))
      .leftJoin(curso, eq(curso.id, announcements.groupId))
      .leftJoin(announcementReads, and(eq(announcementReads.announcementId, announcements.id), eq(announcementReads.userId, session.userId)))
      .where(
        and(
          eq(announcements.institutionId, session.institutionId),
          isNull(announcements.archivadoAt),
          inArray(announcements.audiencia, audienciasDe(session.rol)),
          grados.length ? or(isNull(announcements.gradeLevelId), inArray(announcements.gradeLevelId, grados)) : isNull(announcements.gradeLevelId),
          grupos.length ? or(isNull(announcements.groupId), inArray(announcements.groupId, grupos)) : isNull(announcements.groupId),
        ),
      )
      .orderBy(desc(announcements.fijado), desc(announcements.createdAt))
      .limit(limite);
    return filas.map((f) => ({ ...f, autor: f.autor ?? "", alcance: alcanceDe(f), leido: f.leidoAt !== null }));
  });
}

/** Acuse de lectura: se registra al abrir la página de avisos. */
export async function marcarLeidos(session: Session, ids: string[]) {
  if (!ids.length) return;
  await withTenant(session, (tx) =>
    tx
      .insert(announcementReads)
      .values(ids.map((id) => ({ institutionId: session.institutionId, announcementId: id, userId: session.userId })))
      .onConflictDoNothing(),
  );
}
