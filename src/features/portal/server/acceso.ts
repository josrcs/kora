import "server-only";
import { and, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Tx } from "@/db/client";
import { academicYears, enrollments, groups, studentGuardians, users } from "@/db/schema";
import type { Session } from "@/lib/auth/session";
import type { EstudianteOpcion } from "../types";

/**
 * Quién puede ver la información de un estudiante:
 *   - el propio estudiante;
 *   - sus acudientes registrados con `puede_ver_notas`;
 *   - rectoría y coordinación del colegio (secretaría no);
 *   - el director de grupo del estudiante en el año activo.
 * El colegio ya está filtrado por RLS y por `institution_id` en cada consulta.
 */
export async function puedeVerEstudiante(tx: Tx, session: Session, studentId: string): Promise<boolean> {
  switch (session.rol) {
    case "STUDENT":
      return session.userId === studentId;
    case "GUARDIAN": {
      const [v] = await tx
        .select({ ok: studentGuardians.studentId })
        .from(studentGuardians)
        .where(
          and(
            eq(studentGuardians.institutionId, session.institutionId),
            eq(studentGuardians.guardianId, session.userId),
            eq(studentGuardians.studentId, studentId),
            eq(studentGuardians.puedeVerNotas, true),
          ),
        );
      return !!v;
    }
    case "ADMIN":
      return false; // secretaría administra matrículas, no consulta notas ni observador
    case "RECTOR":
    case "COORDINATOR": {
      const [u] = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, studentId), eq(users.institutionId, session.institutionId), eq(users.rol, "STUDENT")));
      return !!u;
    }
    case "TEACHER": {
      const [d] = await tx
        .select({ id: enrollments.id })
        .from(enrollments)
        .innerJoin(groups, eq(groups.id, enrollments.groupId))
        .innerJoin(academicYears, eq(academicYears.id, enrollments.academicYearId))
        .where(
          and(
            eq(enrollments.studentId, studentId),
            eq(enrollments.institutionId, session.institutionId),
            eq(academicYears.activo, true),
            eq(groups.directorId, session.userId),
          ),
        );
      return !!d;
    }
  }
}

/** Estudiantes que aparecen en el portal: el propio (estudiante) o los hijos/acudidos (acudiente). */
export async function estudiantesDelPortal(tx: Tx, session: Session): Promise<EstudianteOpcion[]> {
  const estudiante = alias(users, "estudiante");
  const base = tx
    .select({
      id: estudiante.id,
      nombre: estudiante.nombreCompleto,
      documento: estudiante.documentoIdentidad,
      grupo: groups.codigo,
    })
    .from(estudiante)
    .leftJoin(academicYears, and(eq(academicYears.institutionId, estudiante.institutionId), eq(academicYears.activo, true)))
    .leftJoin(enrollments, and(eq(enrollments.studentId, estudiante.id), eq(enrollments.academicYearId, academicYears.id)))
    .leftJoin(groups, eq(groups.id, enrollments.groupId));

  const rows =
    session.rol === "STUDENT"
      ? await base.where(and(eq(estudiante.id, session.userId), eq(estudiante.institutionId, session.institutionId)))
      : session.rol === "GUARDIAN"
        ? await base
            .innerJoin(
              studentGuardians,
              and(
                eq(studentGuardians.studentId, estudiante.id),
                eq(studentGuardians.guardianId, session.userId),
                eq(studentGuardians.puedeVerNotas, true),
              ),
            )
            .where(eq(estudiante.institutionId, session.institutionId))
            .orderBy(estudiante.nombreCompleto)
        : [];

  return rows.map((r) => ({ id: r.id, nombre: r.nombre ?? "", documento: r.documento, grupo: r.grupo }));
}
