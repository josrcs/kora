import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { withTenant } from "@/db/client";
import { announcementReads, announcements, users, type AudienciaAviso, type TipoAviso } from "@/db/schema";
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
};
export type AvisoCoordinacion = Aviso & { leidos: number; destinatarios: number; archivado: boolean };
export type AvisoUsuario = Aviso & { leido: boolean };

const audienciasDe = (rol: Session["rol"]): AudienciaAviso[] =>
  rol === "STUDENT" ? ["TODOS", "ESTUDIANTES"] : rol === "GUARDIAN" ? ["TODOS", "ACUDIENTES"] : ["TODOS", "ESTUDIANTES", "ACUDIENTES"];

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
};

/** Para coordinación: todos los avisos con acuse de lectura (leídos / destinatarios). */
export async function avisosDeCoordinacion(session: Session): Promise<AvisoCoordinacion[]> {
  return withTenant(session, async (tx) => {
    const filas = await tx
      .select({ ...columnas, leidos: sql<number>`(select count(*)::int from announcement_reads r where r.announcement_id = ${announcements.id})` })
      .from(announcements)
      .innerJoin(users, eq(users.id, announcements.autorId))
      .where(eq(announcements.institutionId, session.institutionId))
      .orderBy(desc(announcements.fijado), desc(announcements.createdAt))
      .limit(100);

    // Destinatarios: estudiantes con matrícula activa en el año activo y sus acudientes activos.
    const { rows } = await tx.execute<{ estudiantes: number; acudientes: number }>(sql`
      with est as (
        select distinct e.student_id from enrollments e
          join academic_years y on y.id = e.academic_year_id and y.activo
          join users u on u.id = e.student_id and u.activo
         where e.institution_id = ${session.institutionId} and e.estado = 'ACTIVA'
      )
      select (select count(*)::int from est) as estudiantes,
             (select count(distinct sg.guardian_id)::int from student_guardians sg
                join est on est.student_id = sg.student_id
                join users g on g.id = sg.guardian_id and g.activo) as acudientes`);
    const { estudiantes = 0, acudientes = 0 } = rows[0] ?? {};
    const total: Record<AudienciaAviso, number> = { TODOS: estudiantes + acudientes, ESTUDIANTES: estudiantes, ACUDIENTES: acudientes };

    return filas.map((f) => ({
      ...f,
      autor: f.autor ?? "",
      destinatarios: total[f.audiencia],
      archivado: f.archivadoAt !== null,
    }));
  });
}

/** Para estudiantes y acudientes: avisos vigentes dirigidos a su perfil, con marca de leído. */
export async function avisosParaUsuario(session: Session, limite = 50): Promise<AvisoUsuario[]> {
  return withTenant(session, async (tx) => {
    const filas = await tx
      .select({ ...columnas, leidoAt: announcementReads.leidoAt })
      .from(announcements)
      .innerJoin(users, eq(users.id, announcements.autorId))
      .leftJoin(announcementReads, and(eq(announcementReads.announcementId, announcements.id), eq(announcementReads.userId, session.userId)))
      .where(
        and(
          eq(announcements.institutionId, session.institutionId),
          isNull(announcements.archivadoAt),
          inArray(announcements.audiencia, audienciasDe(session.rol)),
        ),
      )
      .orderBy(desc(announcements.fijado), desc(announcements.createdAt))
      .limit(limite);
    return filas.map((f) => ({ ...f, autor: f.autor ?? "", leido: f.leidoAt !== null }));
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
