import "server-only";
import { and, asc, eq, like, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { institutions } from "@/db/schema";

/**
 * `institutions` no tiene RLS: el selector la consulta antes de que exista
 * sesión. Solo se exponen datos públicos del colegio (los mismos del DANE).
 */
export type InstitucionPublica = {
  slug: string;
  nombre: string;
  municipio: string;
  departamento: string;
  codigoDane: string;
  logoUrl: string | null;
};

const columnas = {
  slug: institutions.slug,
  nombre: institutions.nombre,
  municipio: institutions.municipio,
  departamento: institutions.departamento,
  codigoDane: institutions.codigoDane,
  logoUrl: institutions.logoUrl,
};

/** Minúsculas y sin tildes, igual que la columna generada `busqueda`. */
export function normalizar(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const escaparLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function buscarInstituciones(consulta: string, limite = 8): Promise<InstitucionPublica[]> {
  const q = normalizar(consulta);
  if (q.length < 2) return [];

  let filtro: SQL | undefined;
  if (/^\d{3,12}$/.test(q)) {
    filtro = like(institutions.codigoDane, `${q}%`);
  } else {
    // Todas las palabras deben aparecer, en cualquier orden: "isaacs barranquilla".
    filtro = and(...q.split(" ").map((palabra) => like(institutions.busqueda, `%${escaparLike(palabra)}%`)));
  }

  return db
    .select(columnas)
    .from(institutions)
    .where(and(eq(institutions.activo, true), filtro))
    .orderBy(asc(institutions.nombre))
    .limit(limite);
}

/** Colegios activos para las tarjetas iniciales del ingreso (el buscador cubre el resto). */
export async function listarInstituciones(limite = 6): Promise<InstitucionPublica[]> {
  return db.select(columnas).from(institutions).where(eq(institutions.activo, true)).orderBy(asc(institutions.nombre)).limit(limite);
}

export async function institucionPorSlug(slug: string): Promise<InstitucionPublica | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const [row] = await db
    .select(columnas)
    .from(institutions)
    .where(and(eq(institutions.slug, slug), eq(institutions.activo, true)));
  return row ?? null;
}
