import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { withTenant } from "@/db/client";
import { periods } from "@/db/schema";
import type { Session } from "@/lib/auth/session";
import { periodoPorDefecto } from "@/features/planilla/server/queries";
import { estadoAvance, type AvanceAsignacion, type EstadoAvance } from "../types";
import { leerAnioActivo, leerAvanceAsignaciones } from "./queries";

export type PeriodoOpcion = {
  id: string;
  nombre: string;
  numero: number;
  fechaInicio: string;
  fechaFin: string;
  fechaLimiteNotas: string | null;
  cerrado: boolean;
};

export type AvanceDocente = {
  teacherId: string;
  docente: string;
  estudiantes: number;
  conNota: number;
  pendientes: number;
  estado: EstadoAvance;
  ultimaEdicion: string | null;
  asignaciones: (AvanceAsignacion & { estado: EstadoAvance })[];
};

export type Seguimiento = {
  anio: number;
  periodos: PeriodoOpcion[];
  periodo: PeriodoOpcion;
  docentes: AvanceDocente[];
};

const ORDEN_ESTADO: Record<EstadoAvance, number> = { "sin-empezar": 0, "en-curso": 1, "al-dia": 2, "sin-estudiantes": 3 };

/** Avance de digitación agrupado por docente; los más atrasados primero. */
export async function getSeguimiento(session: Session, periodId?: string): Promise<Seguimiento | null> {
  return withTenant(session, async (tx) => {
    const anio = await leerAnioActivo(tx, session.institutionId);
    if (!anio) return null;
    const periodos = await tx
      .select({
        id: periods.id,
        nombre: periods.nombre,
        numero: periods.numero,
        fechaInicio: periods.fechaInicio,
        fechaFin: periods.fechaFin,
        fechaLimiteNotas: periods.fechaLimiteNotas,
        cerrado: periods.cerrado,
      })
      .from(periods)
      .where(and(eq(periods.institutionId, session.institutionId), eq(periods.academicYearId, anio.id)))
      .orderBy(asc(periods.numero));
    const periodo = periodos.find((p) => p.id === periodId) ?? periodoPorDefecto(periodos.map((p) => ({ ...p, porcentaje: 0, cerradoAt: null })));
    if (!periodo) return null;
    const elegido = periodos.find((p) => p.id === periodo.id)!;

    const filas = await leerAvanceAsignaciones(tx, session.institutionId, elegido.id);
    const porDocente = new Map<string, AvanceDocente>();
    for (const f of filas) {
      const d =
        porDocente.get(f.teacherId) ??
        ({ teacherId: f.teacherId, docente: f.docente, estudiantes: 0, conNota: 0, pendientes: 0, estado: "sin-estudiantes", ultimaEdicion: null, asignaciones: [] } satisfies AvanceDocente);
      d.estudiantes += f.estudiantes;
      d.conNota += f.conNota;
      d.pendientes += f.pendientes;
      if (f.ultimaEdicion && (!d.ultimaEdicion || f.ultimaEdicion > d.ultimaEdicion)) d.ultimaEdicion = f.ultimaEdicion;
      d.asignaciones.push({ ...f, estado: estadoAvance(f) });
      porDocente.set(f.teacherId, d);
    }
    const docentes = [...porDocente.values()].map((d) => ({
      ...d,
      estado: estadoAvance(d),
      asignaciones: d.asignaciones.sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] || a.gradoCodigo - b.gradoCodigo || a.grupo.localeCompare(b.grupo)),
    }));
    docentes.sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] || b.pendientes - a.pendientes || a.docente.localeCompare(b.docente));

    return { anio: anio.anio, periodos, periodo: elegido, docentes };
  });
}
