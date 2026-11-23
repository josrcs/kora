"use server";

import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db/client";
import { academicYears, gradeLevels, groups } from "@/db/schema";
import { editarGrupoSchema, grupoSchema, idSchema, type EstadoForm } from "../types";
import { ejecutar, parsear, Rechazo } from "../server/comun";

export async function crearGrupo(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar(
    "crear grupo",
    async (session) => {
      const d = parsear(grupoSchema, formData);
      await withTenant(session, async (tx) => {
        const [anio] = await tx
          .select({ id: academicYears.id })
          .from(academicYears)
          .where(and(eq(academicYears.id, d.academicYearId), eq(academicYears.institutionId, session.institutionId)));
        if (!anio) throw new Rechazo("El año lectivo no existe.");
        const [grado] = await tx
          .select({ id: gradeLevels.id })
          .from(gradeLevels)
          .where(and(eq(gradeLevels.id, d.gradeLevelId), eq(gradeLevels.institutionId, session.institutionId)));
        if (!grado) throw new Rechazo("El grado no existe.");
        await tx.insert(groups).values({ institutionId: session.institutionId, ...d });
      });
      return `Grupo ${d.codigo} creado. Asígnele docentes en Coordinación › Carga académica y matricule estudiantes.`;
    },
    { duplicado: "Ya existe un grupo con ese código en el año." },
  );
}

export async function editarGrupo(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar(
    "editar grupo",
    async (session) => {
      const { id, ...d } = parsear(editarGrupoSchema, formData);
      const n = await withTenant(session, (tx) =>
        tx
          .update(groups)
          .set(d)
          .where(and(eq(groups.id, id), eq(groups.institutionId, session.institutionId)))
          .returning({ id: groups.id }),
      );
      if (!n.length) throw new Rechazo("El grupo ya no existe.");
      return "Grupo actualizado.";
    },
    { duplicado: "Ya existe un grupo con ese código en el año." },
  );
}

export async function eliminarGrupo(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar(
    "eliminar grupo",
    async (session) => {
      const { id } = parsear(idSchema, formData);
      const n = await withTenant(session, (tx) =>
        tx
          .delete(groups)
          .where(and(eq(groups.id, id), eq(groups.institutionId, session.institutionId)))
          .returning({ codigo: groups.codigo }),
      );
      if (!n.length) throw new Rechazo("El grupo ya no existe.");
      return `Grupo ${n[0].codigo} eliminado.`;
    },
    { enUso: "El grupo tiene matrículas o carga académica: no se puede eliminar." },
  );
}
