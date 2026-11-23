import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { withTenant } from "@/db/client";
import { enrollments, gradeLevels, groups, studentGuardians, users } from "@/db/schema";
import type { Session } from "@/lib/auth/session";
import { leerAnioActivo } from "@/features/periodos/server/queries";

export type GrupoOpcion = { id: string; codigo: string; gradeLevelId: string; grado: string; gradoCodigo: number; matriculados: number; capacidad: number | null };

export type MatriculaFila = {
  enrollmentId: string;
  studentId: string;
  documento: string;
  tipoDocumento: string;
  nombre: string;
  estado: "ACTIVA" | "RETIRADA" | "TRASLADADA";
  fechaMatricula: string;
  fechaRetiro: string | null;
  motivoRetiro: string | null;
  acudiente: string | null;
  telefonoAcudiente: string | null;
  debeCambiarPassword: boolean;
};

export type Matriculas = {
  anio: { id: string; anio: number };
  grupos: GrupoOpcion[];
  grupo: GrupoOpcion | null;
  filas: MatriculaFila[];
};

export async function getMatriculas(session: Session, groupId?: string): Promise<Matriculas | null> {
  return withTenant(session, async (tx) => {
    const anio = await leerAnioActivo(tx, session.institutionId);
    if (!anio) return null;

    const grupos = await tx
      .select({
        id: groups.id,
        codigo: groups.codigo,
        gradeLevelId: groups.gradeLevelId,
        grado: gradeLevels.nombre,
        gradoCodigo: gradeLevels.codigo,
        capacidad: groups.capacidad,
        matriculados: sql<number>`(select count(*)::int from enrollments e where e.group_id = groups.id and e.estado = 'ACTIVA')`,
      })
      .from(groups)
      .innerJoin(gradeLevels, eq(gradeLevels.id, groups.gradeLevelId))
      .where(and(eq(groups.institutionId, session.institutionId), eq(groups.academicYearId, anio.id)))
      .orderBy(asc(gradeLevels.codigo), asc(groups.codigo));
    const grupo = grupos.find((g) => g.id === groupId) ?? grupos[0] ?? null;

    let filas: MatriculaFila[] = [];
    if (grupo) {
      const estudiante = alias(users, "estudiante");
      const acudiente = alias(users, "acudiente");
      const rows = await tx
        .select({
          enrollmentId: enrollments.id,
          studentId: estudiante.id,
          documento: estudiante.documentoIdentidad,
          tipoDocumento: estudiante.tipoDocumento,
          nombre: estudiante.nombreCompleto,
          estado: enrollments.estado,
          fechaMatricula: enrollments.fechaMatricula,
          fechaRetiro: enrollments.fechaRetiro,
          motivoRetiro: enrollments.motivoRetiro,
          acudiente: acudiente.nombreCompleto,
          telefonoAcudiente: acudiente.telefono,
          debeCambiarPassword: estudiante.debeCambiarPassword,
        })
        .from(enrollments)
        .innerJoin(estudiante, eq(estudiante.id, enrollments.studentId))
        .leftJoin(studentGuardians, and(eq(studentGuardians.studentId, estudiante.id), eq(studentGuardians.esPrincipal, true)))
        .leftJoin(acudiente, eq(acudiente.id, studentGuardians.guardianId))
        .where(eq(enrollments.groupId, grupo.id))
        .orderBy(asc(estudiante.apellidos), asc(estudiante.nombres));
      filas = rows.map((r) => ({ ...r, nombre: r.nombre ?? "" }));
    }
    return { anio: { id: anio.id, anio: anio.anio }, grupos, grupo, filas };
  });
}

export type PersonaEncontrada =
  | { existe: false }
  | {
      existe: true;
      rol: string;
      tipoDocumento: string;
      nombres: string;
      apellidos: string;
      telefono: string | null;
      /** Grupo del año activo si ya está matriculado. */
      matriculadoEn: string | null;
    };

export async function buscarPersona(session: Session, documento: string): Promise<PersonaEncontrada> {
  return withTenant(session, async (tx) => {
    const [u] = await tx
      .select({
        id: users.id,
        rol: users.rol,
        tipoDocumento: users.tipoDocumento,
        nombres: users.nombres,
        apellidos: users.apellidos,
        telefono: users.telefono,
      })
      .from(users)
      .where(and(eq(users.institutionId, session.institutionId), eq(users.documentoIdentidad, documento)));
    if (!u) return { existe: false };
    const anio = await leerAnioActivo(tx, session.institutionId);
    const [m] = anio
      ? await tx
          .select({ codigo: groups.codigo, estado: enrollments.estado })
          .from(enrollments)
          .innerJoin(groups, eq(groups.id, enrollments.groupId))
          .where(and(eq(enrollments.studentId, u.id), eq(enrollments.academicYearId, anio.id)))
      : [];
    return {
      existe: true,
      rol: u.rol,
      tipoDocumento: u.tipoDocumento,
      nombres: u.nombres,
      apellidos: u.apellidos,
      telefono: u.telefono,
      matriculadoEn: m ? `${m.codigo}${m.estado !== "ACTIVA" ? ` (${m.estado.toLowerCase()})` : ""}` : null,
    };
  });
}
