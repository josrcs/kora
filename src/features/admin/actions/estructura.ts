"use server";

import { and, eq } from "drizzle-orm";
import { withTenant, type Tx } from "@/db/client";
import { areas, gradeLevels, subjects } from "@/db/schema";
import {
  areaSchema,
  asignaturaSchema,
  editarAreaSchema,
  editarAsignaturaSchema,
  GRADOS_ESTANDAR,
  gradoSchema,
  idSchema,
  type EstadoForm,
} from "../types";
import { ejecutar, parsear, Rechazo } from "../server/comun";

/* ---------------- Grados ---------------- */
export async function crearGrado(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar(
    "crear grado",
    async (session) => {
      const { codigo } = parsear(gradoSchema, formData);
      const g = GRADOS_ESTANDAR.find((x) => x.codigo === codigo);
      if (!g) throw new Rechazo("Grado inválido.");
      await withTenant(session, (tx) =>
        tx.insert(gradeLevels).values({ institutionId: session.institutionId, codigo, nombre: g.nombre, nivel: g.nivel }),
      );
      return `Grado ${g.nombre} agregado.`;
    },
    { duplicado: "Ese grado ya existe." },
  );
}

export async function eliminarGrado(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar(
    "eliminar grado",
    async (session) => {
      const { id } = parsear(idSchema, formData);
      const borrados = await withTenant(session, (tx) =>
        tx
          .delete(gradeLevels)
          .where(and(eq(gradeLevels.id, id), eq(gradeLevels.institutionId, session.institutionId)))
          .returning({ nombre: gradeLevels.nombre }),
      );
      if (!borrados.length) throw new Rechazo("El grado ya no existe.");
      return `Grado ${borrados[0].nombre} eliminado.`;
    },
    { enUso: "El grado tiene grupos o logros (de este u otros años): no se puede eliminar." },
  );
}

/* ---------------- Áreas ---------------- */
export async function crearArea(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar(
    "crear área",
    async (session) => {
      const d = parsear(areaSchema, formData);
      await withTenant(session, (tx) => tx.insert(areas).values({ institutionId: session.institutionId, ...d }));
      return `Área «${d.nombre}» creada.`;
    },
    { duplicado: "Ya existe un área con ese nombre." },
  );
}

export async function editarArea(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar(
    "editar área",
    async (session) => {
      const { id, ...d } = parsear(editarAreaSchema, formData);
      const n = await withTenant(session, (tx) =>
        tx
          .update(areas)
          .set(d)
          .where(and(eq(areas.id, id), eq(areas.institutionId, session.institutionId)))
          .returning({ id: areas.id }),
      );
      if (!n.length) throw new Rechazo("El área ya no existe.");
      return "Área actualizada.";
    },
    { duplicado: "Ya existe un área con ese nombre." },
  );
}

export async function eliminarArea(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar(
    "eliminar área",
    async (session) => {
      const { id } = parsear(idSchema, formData);
      const n = await withTenant(session, (tx) =>
        tx
          .delete(areas)
          .where(and(eq(areas.id, id), eq(areas.institutionId, session.institutionId)))
          .returning({ nombre: areas.nombre }),
      );
      if (!n.length) throw new Rechazo("El área ya no existe.");
      return `Área «${n[0].nombre}» eliminada.`;
    },
    { enUso: "El área tiene asignaturas: elimínelas o muévalas primero." },
  );
}

/* ---------------- Asignaturas ---------------- */
async function areaDelColegio(institutionId: string, areaId: string, tx: Tx) {
  const [a] = await tx.select({ id: areas.id }).from(areas).where(and(eq(areas.id, areaId), eq(areas.institutionId, institutionId)));
  if (!a) throw new Rechazo("El área no existe.");
}

export async function crearAsignatura(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar(
    "crear asignatura",
    async (session) => {
      const d = parsear(asignaturaSchema, formData);
      await withTenant(session, async (tx) => {
        await areaDelColegio(session.institutionId, d.areaId, tx);
        await tx.insert(subjects).values({ institutionId: session.institutionId, ...d });
      });
      return `Asignatura «${d.nombre}» creada. Asígnele docente en Coordinación › Carga académica.`;
    },
    { duplicado: "Ya existe una asignatura con ese nombre." },
  );
}

export async function editarAsignatura(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar(
    "editar asignatura",
    async (session) => {
      const { id, ...d } = parsear(editarAsignaturaSchema, formData);
      await withTenant(session, async (tx) => {
        await areaDelColegio(session.institutionId, d.areaId, tx);
        const n = await tx
          .update(subjects)
          .set(d)
          .where(and(eq(subjects.id, id), eq(subjects.institutionId, session.institutionId)))
          .returning({ id: subjects.id });
        if (!n.length) throw new Rechazo("La asignatura ya no existe.");
      });
      return d.activo ? "Asignatura actualizada." : "Asignatura actualizada e inactiva: ya no aparece en la carga académica.";
    },
    { duplicado: "Ya existe una asignatura con ese nombre." },
  );
}

export async function eliminarAsignatura(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar(
    "eliminar asignatura",
    async (session) => {
      const { id } = parsear(idSchema, formData);
      const n = await withTenant(session, (tx) =>
        tx
          .delete(subjects)
          .where(and(eq(subjects.id, id), eq(subjects.institutionId, session.institutionId)))
          .returning({ nombre: subjects.nombre }),
      );
      if (!n.length) throw new Rechazo("La asignatura ya no existe.");
      return `Asignatura «${n[0].nombre}» eliminada.`;
    },
    { enUso: "La asignatura ya se usó (carga académica o logros): no se puede eliminar. Márquela como inactiva." },
  );
}
