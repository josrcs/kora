"use server";

import { and, desc, eq, max, ne } from "drizzle-orm";
import { withTenant, type Tx } from "@/db/client";
import { academicYears, periods } from "@/db/schema";
import { diasEntre } from "@/lib/fechas";
import { anioSchema, editarPeriodoSchema, idSchema, periodoSchema, type EstadoForm } from "../types";
import { ejecutar, parsear, Rechazo } from "../server/comun";

async function anioDelColegio(tx: Tx, institutionId: string, id: string) {
  const [a] = await tx
    .select()
    .from(academicYears)
    .where(and(eq(academicYears.id, id), eq(academicYears.institutionId, institutionId)))
    .for("update");
  if (!a) throw new Rechazo("El año lectivo no existe.");
  return a;
}

function sumarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Crea un año lectivo (inactivo) y, si se pide, N periodos con porcentajes y fechas repartidos por igual. */
export async function crearAnio(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar(
    "crear año",
    async (session) => {
      const d = parsear(anioSchema, formData);
      await withTenant(session, async (tx) => {
        const [anio] = await tx
          .insert(academicYears)
          .values({ institutionId: session.institutionId, anio: d.anio, fechaInicio: d.fechaInicio, fechaFin: d.fechaFin, activo: false })
          .returning({ id: academicYears.id });
        if (d.periodos === 0) return;

        // Porcentajes en centésimas: 100 / 3 → 33.33, 33.33, 33.34. Fechas contiguas sin solape.
        const total = diasEntre(d.fechaInicio, d.fechaFin) + 1;
        const base = Math.floor(10000 / d.periodos);
        let inicio = d.fechaInicio;
        for (let i = 1; i <= d.periodos; i++) {
          const ultimo = i === d.periodos;
          const fin = ultimo ? d.fechaFin : sumarDias(d.fechaInicio, Math.round((total * i) / d.periodos) - 1);
          await tx.insert(periods).values({
            institutionId: session.institutionId,
            academicYearId: anio.id,
            numero: i,
            nombre: `Periodo ${i}`,
            porcentaje: (ultimo ? 10000 - base * (d.periodos - 1) : base) / 100,
            fechaInicio: inicio,
            fechaFin: fin,
            fechaLimiteNotas: fin,
          });
          inicio = sumarDias(fin, 1);
        }
      });
      return `Año lectivo ${d.anio} creado${d.periodos ? ` con ${d.periodos} periodos` : ""}. Queda inactivo hasta que lo active.`;
    },
    { duplicado: "Ya existe un año lectivo con ese número." },
  );
}

/** Activa un año: pasa a ser el de planillas, portal y coordinación. Desactiva el anterior. */
export async function activarAnio(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar("activar año", async (session) => {
    const { id } = parsear(idSchema, formData);
    const anio = await withTenant(session, async (tx) => {
      const a = await anioDelColegio(tx, session.institutionId, id);
      if (a.activo) throw new Rechazo(`${a.anio} ya es el año activo.`);
      await tx
        .update(academicYears)
        .set({ activo: false })
        .where(and(eq(academicYears.institutionId, session.institutionId), ne(academicYears.id, id)));
      await tx.update(academicYears).set({ activo: true }).where(eq(academicYears.id, id));
      return a.anio;
    });
    return `${anio} es ahora el año lectivo activo.`;
  });
}

/** Elimina un año sin grupos ni periodos con información (se usa para deshacer un año creado por error). */
export async function eliminarAnio(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar(
    "eliminar año",
    async (session) => {
      const { id } = parsear(idSchema, formData);
      const anio = await withTenant(session, async (tx) => {
        const a = await anioDelColegio(tx, session.institutionId, id);
        if (a.activo) throw new Rechazo("No se puede eliminar el año activo.");
        // Los periodos vacíos se van con el año (ON DELETE CASCADE); grupos o logros lo impiden (RESTRICT).
        await tx.delete(academicYears).where(eq(academicYears.id, id));
        return a.anio;
      });
      return `Año ${anio} eliminado.`;
    },
    { enUso: "El año ya tiene grupos, matrículas o logros: no se puede eliminar." },
  );
}

export async function crearPeriodo(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar(
    "crear periodo",
    async (session) => {
      const d = parsear(periodoSchema, formData);
      await withTenant(session, async (tx) => {
        const a = await anioDelColegio(tx, session.institutionId, d.academicYearId);
        if (a.fechaInicio && d.fechaInicio < a.fechaInicio) throw new Rechazo("El periodo empieza antes que el año lectivo.");
        if (a.fechaFin && d.fechaFin > a.fechaFin) throw new Rechazo("El periodo termina después que el año lectivo.");
        const [{ ultimo }] = await tx.select({ ultimo: max(periods.numero) }).from(periods).where(eq(periods.academicYearId, a.id));
        const numero = (ultimo ?? 0) + 1;
        if (numero > 6) throw new Rechazo("Un año lectivo tiene como máximo 6 periodos.");
        await tx.insert(periods).values({
          institutionId: session.institutionId,
          academicYearId: a.id,
          numero,
          nombre: d.nombre,
          porcentaje: d.porcentaje,
          fechaInicio: d.fechaInicio,
          fechaFin: d.fechaFin,
          fechaLimiteNotas: d.fechaLimiteNotas,
        });
      });
      return `${d.nombre} creado.`;
    },
    { duplicado: "Ya existe un periodo con ese número en el año." },
  );
}

/**
 * Edita un periodo abierto. El porcentaje solo cambia si ningún periodo del
 * año está cerrado: cambiarlo alteraría acumulados de boletines ya publicados.
 */
export async function editarPeriodo(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar("editar periodo", async (session) => {
    const d = parsear(editarPeriodoSchema, formData);
    await withTenant(session, async (tx) => {
      const [p] = await tx
        .select()
        .from(periods)
        .where(and(eq(periods.id, d.id), eq(periods.institutionId, session.institutionId)))
        .for("update");
      if (!p) throw new Rechazo("El periodo no existe.");
      if (p.cerrado) throw new Rechazo(`${p.nombre} está cerrado: reábralo en Coordinación › Periodos para modificarlo.`);
      const a = await anioDelColegio(tx, session.institutionId, p.academicYearId);
      if (a.fechaInicio && d.fechaInicio < a.fechaInicio) throw new Rechazo("El periodo empieza antes que el año lectivo.");
      if (a.fechaFin && d.fechaFin > a.fechaFin) throw new Rechazo("El periodo termina después que el año lectivo.");
      if (d.porcentaje !== p.porcentaje) {
        const [cerrado] = await tx
          .select({ nombre: periods.nombre })
          .from(periods)
          .where(and(eq(periods.academicYearId, p.academicYearId), eq(periods.cerrado, true)))
          .limit(1);
        if (cerrado) {
          throw new Rechazo(`No se puede cambiar el porcentaje: ${cerrado.nombre} ya está cerrado y su boletín publicado usa los porcentajes actuales.`);
        }
      }
      await tx
        .update(periods)
        .set({ nombre: d.nombre, porcentaje: d.porcentaje, fechaInicio: d.fechaInicio, fechaFin: d.fechaFin, fechaLimiteNotas: d.fechaLimiteNotas })
        .where(eq(periods.id, d.id));
    });
    return "Periodo actualizado.";
  });
}

/** Elimina el ÚLTIMO periodo de un año, si no tiene calificaciones ni logros. */
export async function eliminarPeriodo(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  return ejecutar(
    "eliminar periodo",
    async (session) => {
      const { id } = parsear(idSchema, formData);
      const nombre = await withTenant(session, async (tx) => {
        const [p] = await tx
          .select()
          .from(periods)
          .where(and(eq(periods.id, id), eq(periods.institutionId, session.institutionId)))
          .for("update");
        if (!p) throw new Rechazo("El periodo no existe.");
        if (p.cerrado) throw new Rechazo("Un periodo cerrado no se puede eliminar.");
        const [ultimo] = await tx
          .select({ id: periods.id })
          .from(periods)
          .where(eq(periods.academicYearId, p.academicYearId))
          .orderBy(desc(periods.numero))
          .limit(1);
        if (ultimo.id !== p.id) throw new Rechazo("Solo se puede eliminar el último periodo del año (para no dejar huecos en la numeración).");
        await tx.delete(periods).where(eq(periods.id, id));
        return p.nombre;
      });
      return `${nombre} eliminado.`;
    },
    { enUso: "El periodo ya tiene logros o calificaciones: no se puede eliminar." },
  );
}
