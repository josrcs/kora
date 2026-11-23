"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { withTenant, type Tx } from "@/db/client";
import { enrollments, groups, studentGuardians, users } from "@/db/schema";
import { ROLES_ADMINISTRACION, sessionParaAccion } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { leerAnioActivo } from "@/features/periodos/server/queries";
import { buscarPersona, type PersonaEncontrada } from "../server/matriculas";
import { claveTemporal, ejecutar, parsear, Rechazo } from "../server/comun";
import { registrarAutorizacionRepresentante } from "@/features/privacidad/server";
import { buscarPersonaSchema, idSchema, matriculaSchema, retiroSchema, trasladoSchema, type EstadoForm } from "../types";

const ROL_TEXTO: Record<string, string> = {
  ADMIN: "administración",
  COORDINATOR: "coordinación",
  TEACHER: "un docente",
  STUDENT: "un estudiante",
  GUARDIAN: "un acudiente",
};

/** Consulta por documento para prellenar el formulario de matrícula. */
export async function consultarDocumento(documento: string): Promise<PersonaEncontrada | { error: string }> {
  const session = await sessionParaAccion(ROLES_ADMINISTRACION);
  if (!session) return { error: "Sin permiso." };
  const d = buscarPersonaSchema.safeParse({ documento });
  if (!d.success) return { error: d.error.issues[0].message };
  return buscarPersona(session, d.data.documento);
}

type Persona = { tipoDocumento: (typeof users.$inferInsert)["tipoDocumento"]; documento: string; nombres: string; apellidos: string; telefono?: string };

/** Devuelve el usuario con ese documento (si tiene el rol esperado) o lo crea con clave temporal. */
async function obtenerOCrear(tx: Tx, institutionId: string, rol: "STUDENT" | "GUARDIAN", p: Persona) {
  const [u] = await tx
    .select({ id: users.id, rol: users.rol, nombre: users.nombreCompleto })
    .from(users)
    .where(and(eq(users.institutionId, institutionId), eq(users.documentoIdentidad, p.documento)));
  if (u) {
    if (u.rol !== rol) {
      throw new Rechazo(`El documento ${p.documento} ya está registrado como ${ROL_TEXTO[u.rol]} (${u.nombre}).`);
    }
    return { id: u.id, nombre: u.nombre ?? "", clave: null as string | null };
  }
  if (p.nombres.length < 2 || p.apellidos.length < 2) {
    throw new Rechazo(`Escriba nombres y apellidos del ${rol === "STUDENT" ? "estudiante" : "acudiente"} (documento ${p.documento} no registrado).`);
  }
  const clave = claveTemporal();
  const [nuevo] = await tx
    .insert(users)
    .values({
      institutionId,
      tipoDocumento: p.tipoDocumento,
      documentoIdentidad: p.documento,
      nombres: p.nombres,
      apellidos: p.apellidos,
      telefono: p.telefono || null,
      passwordHash: await hashPassword(clave),
      rol,
      debeCambiarPassword: true,
    })
    .returning({ id: users.id, nombre: users.nombreCompleto });
  return { id: nuevo.id, nombre: nuevo.nombre ?? "", clave };
}

async function grupoDelAnioActivo(tx: Tx, institutionId: string, groupId: string) {
  const anio = await leerAnioActivo(tx, institutionId);
  if (!anio) throw new Rechazo("No hay un año lectivo activo.");
  const [g] = await tx
    .select({ id: groups.id, codigo: groups.codigo, capacidad: groups.capacidad, academicYearId: groups.academicYearId })
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.institutionId, institutionId), eq(groups.academicYearId, anio.id)));
  if (!g) throw new Rechazo("El grupo no existe o no es del año lectivo activo.");
  return { ...g, anio: anio.anio };
}

/**
 * Matrícula en el año activo. Crea al estudiante (y al acudiente) si no
 * existen, con clave temporal que se muestra una sola vez.
 */
export async function matricular(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar("matricular", async (session) => {
    const d = parsear(matriculaSchema, formData);
    return withTenant(session, async (tx) => {
      const grupo = await grupoDelAnioActivo(tx, session.institutionId, d.groupId);
      const est = await obtenerOCrear(tx, session.institutionId, "STUDENT", d);

      const [previa] = await tx
        .select({ codigo: groups.codigo, estado: enrollments.estado })
        .from(enrollments)
        .innerJoin(groups, eq(groups.id, enrollments.groupId))
        .where(and(eq(enrollments.studentId, est.id), eq(enrollments.academicYearId, grupo.academicYearId)));
      if (previa) {
        throw new Rechazo(
          previa.estado === "ACTIVA"
            ? `${est.nombre} ya está matriculado en ${previa.codigo}. Para moverlo use «Cambiar de grupo».`
            : `${est.nombre} tuvo matrícula este año en ${previa.codigo} (${previa.estado.toLowerCase()}). Reactivar una matrícula retirada aún no está disponible.`,
        );
      }
      await tx.insert(enrollments).values({
        institutionId: session.institutionId,
        academicYearId: grupo.academicYearId,
        groupId: grupo.id,
        studentId: est.id,
        fechaMatricula: d.fechaMatricula,
      });
      // Evidencia de la autorización del representante legal (cada matrícula deja su registro).
      await registrarAutorizacionRepresentante(tx, {
        institutionId: session.institutionId,
        estudianteId: est.id,
        registradoPor: session.userId,
        nombre: d.representanteNombre,
        documento: d.representanteDocumento,
        parentesco: d.representanteParentesco,
      });

      const secreto: { etiqueta: string; valor: string }[] = [];
      if (est.clave) secreto.push({ etiqueta: `Estudiante ${est.nombre} (${d.documento})`, valor: est.clave });

      let acudienteTexto = "";
      if (d.acudienteDocumento) {
        const acu = await obtenerOCrear(tx, session.institutionId, "GUARDIAN", {
          tipoDocumento: d.acudienteTipoDocumento,
          documento: d.acudienteDocumento,
          nombres: d.acudienteNombres,
          apellidos: d.acudienteApellidos,
          telefono: d.acudienteTelefono,
        });
        const [principal] = await tx
          .select({ g: studentGuardians.guardianId })
          .from(studentGuardians)
          .where(and(eq(studentGuardians.studentId, est.id), eq(studentGuardians.esPrincipal, true)));
        await tx
          .insert(studentGuardians)
          .values({
            institutionId: session.institutionId,
            studentId: est.id,
            guardianId: acu.id,
            parentesco: d.acudienteParentesco,
            esPrincipal: !principal,
          })
          .onConflictDoNothing();
        if (acu.clave) secreto.push({ etiqueta: `Acudiente ${acu.nombre} (${d.acudienteDocumento})`, valor: acu.clave });
        acudienteTexto = ` Acudiente: ${acu.nombre}.`;
      }

      const sobrecupo = grupo.capacidad !== null && (await contarActivas(tx, grupo.id)) > grupo.capacidad;
      return {
        ok: true,
        error: null,
        mensaje: `${est.nombre} matriculado en ${grupo.codigo} (${grupo.anio}).${acudienteTexto}${sobrecupo ? ` Atención: ${grupo.codigo} supera su capacidad de ${grupo.capacidad}.` : ""}`,
        secreto,
      };
    });
  });
}

async function contarActivas(tx: Tx, groupId: string) {
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(enrollments)
    .where(and(eq(enrollments.groupId, groupId), eq(enrollments.estado, "ACTIVA")));
  return n;
}

/** Cambio de grupo dentro del mismo grado: la base mueve también las calificaciones (fn_trasladar_matricula). */
export async function cambiarGrupo(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar("cambiar grupo", async (session) => {
    const d = parsear(trasladoSchema, formData);
    return withTenant(session, async (tx) => {
      const grupo = await grupoDelAnioActivo(tx, session.institutionId, d.groupId);
      const [m] = await tx
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(and(eq(enrollments.id, d.enrollmentId), eq(enrollments.institutionId, session.institutionId)));
      if (!m) throw new Rechazo("La matrícula no existe.");
      const { rows } = await tx.execute<{ movidas: number }>(sql`select fn_trasladar_matricula(${m.id}, ${grupo.id}) as movidas`);
      const movidas = rows[0]?.movidas ?? 0;
      return `Estudiante trasladado a ${grupo.codigo}${movidas ? `; ${movidas} calificaciones pasaron a las asignaturas de ${grupo.codigo}` : ""}.`;
    });
  });
}

/** Retiro (deserción) o traslado a otra institución. Las notas quedan; el estudiante sale de las planillas. */
export async function retirar(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar("retirar", async (session) => {
    const d = parsear(retiroSchema, formData);
    const n = await withTenant(session, (tx) =>
      tx
        .update(enrollments)
        .set({ estado: d.estado, fechaRetiro: d.fechaRetiro, motivoRetiro: d.motivo })
        .where(
          and(eq(enrollments.id, d.enrollmentId), eq(enrollments.institutionId, session.institutionId), eq(enrollments.estado, "ACTIVA")),
        )
        .returning({ id: enrollments.id }),
    );
    if (!n.length) throw new Rechazo("La matrícula no está activa o no existe.");
    return d.estado === "RETIRADA" ? "Matrícula retirada." : "Registrado el traslado a otra institución.";
  });
}

/** Nueva clave temporal para un estudiante o acudiente (no para personal: eso es de administración de usuarios). */
export async function restablecerClave(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar("restablecer clave", async (session) => {
    const { id } = parsear(idSchema, formData);
    const clave = claveTemporal();
    const hash = await hashPassword(clave);
    const [u] = await withTenant(session, (tx) =>
      tx
        .update(users)
        .set({ passwordHash: hash, debeCambiarPassword: true, sesionVersion: sql`${users.sesionVersion} + 1` })
        .where(and(eq(users.id, id), eq(users.institutionId, session.institutionId), inArray(users.rol, ["STUDENT", "GUARDIAN"])))
        .returning({ nombre: users.nombreCompleto, documento: users.documentoIdentidad }),
    );
    if (!u) throw new Rechazo("El usuario no existe o no es estudiante/acudiente.");
    return {
      ok: true,
      error: null,
      mensaje: "Clave restablecida; las sesiones abiertas de esa cuenta se cerraron.",
      secreto: [{ etiqueta: `${u.nombre} (${u.documento})`, valor: clave }],
    };
  });
}
