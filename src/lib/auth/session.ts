import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify, SignJWT } from "jose";
import { and, eq, sql } from "drizzle-orm";
import { withTenant, type TenantContext } from "@/db/client";
import { institutions, users, type Rol } from "@/db/schema";
import { VERSION_POLITICA } from "@/features/privacidad/politica";

/**
 * Sesión firmada (JWT HS256) en cookie httpOnly. Solo guarda identificadores
 * y la versión de sesión del usuario; el usuario se vuelve a leer de la base
 * en cada petición, así que desactivar la cuenta, cambiar el rol o cambiar
 * la contraseña (que sube `sesion_version`) surte efecto de inmediato.
 */
const COOKIE_SESION = "kora_session";
/** Recuerda el último colegio usado en este navegador para saltar el selector. */
export const COOKIE_COLEGIO = "kora_colegio";
const DURACION_HORAS = 8;

export type Session = TenantContext & {
  rol: Rol;
  nombre: string;
  debeCambiarPassword: boolean;
  /** Aceptó la versión vigente de la política de tratamiento de datos (Ley 1581). Sin esto no puede usar la cuenta. */
  politicaAceptada: boolean;
  institucion: { nombre: string; slug: string };
};

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET debe tener al menos 32 caracteres");
  return new TextEncoder().encode(s);
}

const cookieSegura = () => process.env.NODE_ENV === "production";

export async function createSession(ctx: TenantContext & { sesionVersion: number; slug: string }) {
  const token = await new SignJWT({ iid: ctx.institutionId, sv: ctx.sesionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(ctx.userId)
    .setIssuedAt()
    .setExpirationTime(`${DURACION_HORAS}h`)
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE_SESION, token, {
    httpOnly: true,
    secure: cookieSegura(),
    sameSite: "lax",
    path: "/",
    maxAge: DURACION_HORAS * 3600,
  });
  jar.set(COOKIE_COLEGIO, ctx.slug, {
    httpOnly: true,
    secure: cookieSegura(),
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 3600,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE_SESION);
}

type Token = TenantContext & { sesionVersion: number };

async function leerToken(): Promise<Token | null> {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.iid !== "string" || typeof payload.sv !== "number") return null;
    return { userId: payload.sub, institutionId: payload.iid, sesionVersion: payload.sv };
  } catch {
    return null;
  }
}

/** Deduplicada por petición: layout, página y componentes comparten una sola lectura. */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = await leerToken();
  if (!token) return null;

  const [row] = await withTenant(token, (tx) =>
    tx
      .select({
        rol: users.rol,
        nombres: users.nombres,
        apellidos: users.apellidos,
        debeCambiarPassword: users.debeCambiarPassword,
        sesionVersion: users.sesionVersion,
        politicaAceptada: sql<boolean>`coalesce((
          select dc.aceptado from data_consents dc
           where dc.user_id = ${users.id} and dc.tipo = 'ACEPTACION_USUARIO' and dc.version = ${VERSION_POLITICA}
           order by dc.created_at desc limit 1), false)`,
        institucionNombre: institutions.nombre,
        slug: institutions.slug,
      })
      .from(users)
      .innerJoin(institutions, eq(institutions.id, users.institutionId))
      .where(
        and(
          eq(users.id, token.userId),
          eq(users.institutionId, token.institutionId),
          eq(users.activo, true),
          eq(institutions.activo, true),
        ),
      ),
  );
  if (!row || row.sesionVersion !== token.sesionVersion) return null;
  return {
    institutionId: token.institutionId,
    userId: token.userId,
    rol: row.rol,
    nombre: `${row.nombres} ${row.apellidos}`,
    debeCambiarPassword: row.debeCambiarPassword,
    politicaAceptada: row.politicaAceptada,
    institucion: { nombre: row.institucionNombre, slug: row.slug },
  };
});

/*
 * Matriz de permisos. La autorización real se repite en cada página y acción
 * (y la base valida autoría de notas y procesos); el menú solo la refleja.
 *
 *                     planillas/notas     coordinación   administración   rectoría   observador        procesos   portal
 *   Estudiante/acud.         –                  –              –             –          –                 –       solo lo suyo
 *   Docente           SOLO sus asignaciones     –              –             –      sus estudiantes      –           –
 *   Coordinación         todas (única)          ✓              ✓             ✓      todo el colegio      ✓           –
 *   Rector                   –                  –              –             ✓      todo el colegio      –           –
 *   Secretaría (admin)       –                  –              ✓             –          –                 –           –
 *
 * La base lo repite: solo el docente asignado o coordinación escriben notas
 * (fn_assert_editor_asignacion), los periodos cerrados no se tocan salvo la
 * recuperación en su ventana, y solo coordinación abre procesos.
 */
/** Coordinación académica: periodos, seguimiento, carga, corte preventivo y TODAS las notas. */
export const ROLES_COORDINACION = ["COORDINATOR"] as const satisfies readonly Rol[];
/** Estructura del año y matrículas (secretaría y coordinación). */
export const ROLES_ADMINISTRACION = ["COORDINATOR", "ADMIN"] as const satisfies readonly Rol[];
/** Panel de rectoría: resultados de todo el colegio (solo lectura académica). */
export const ROLES_RECTORIA = ["RECTOR", "COORDINATOR"] as const satisfies readonly Rol[];
/** Página de convivencia (observador de todo el colegio). */
export const ROLES_CONVIVENCIA = ["RECTOR", "COORDINATOR"] as const satisfies readonly Rol[];
/** Pueden escribir anotaciones (el docente, solo de estudiantes de sus grupos, desde su planilla). */
export const ROLES_ANOTACIONES = ["RECTOR", "COORDINATOR", "TEACHER"] as const satisfies readonly Rol[];
/** Pueden abrir y cerrar procesos disciplinarios. */
export const ROLES_PROCESOS = ["COORDINATOR"] as const satisfies readonly Rol[];
/** Planillas: el docente las suyas; coordinación, todas. */
export const ROLES_PLANILLA = ["TEACHER", "COORDINATOR"] as const satisfies readonly Rol[];

/** Página de inicio de cada rol después de ingresar. */
export function rutaInicio(rol: Rol): string {
  switch (rol) {
    case "RECTOR":
      return "/rectoria";
    case "COORDINATOR":
      return "/coordinacion";
    case "ADMIN":
      return "/admin/matriculas";
    case "TEACHER":
      return "/docente/planilla";
    default:
      return "/portal";
  }
}

/**
 * Para Server Actions: la sesión si existe, no debe cambiar la clave y su
 * rol está permitido; si no, null (la acción responde con un error, no redirige).
 */
export async function sessionParaAccion(roles: readonly Rol[]): Promise<Session | null> {
  const session = await getSession();
  if (!session || !session.politicaAceptada || session.debeCambiarPassword || !roles.includes(session.rol)) return null;
  return session;
}

/**
 * Para páginas: redirige al ingreso si no hay sesión; a aceptar la política de
 * datos si no la ha aceptado (va primero: sin autorización la cuenta no se
 * activa); a cambiar la clave si es obligatorio; o a "sin acceso" si el rol no aplica.
 */
export async function requireSession(
  roles?: readonly Rol[],
  {
    permitirClavePendiente = false,
    permitirPoliticaPendiente = false,
  }: { permitirClavePendiente?: boolean; permitirPoliticaPendiente?: boolean } = {},
): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.politicaAceptada && !permitirPoliticaPendiente) redirect("/autorizacion-datos");
  if (session.debeCambiarPassword && !permitirClavePendiente) redirect("/cambiar-clave");
  if (roles && !roles.includes(session.rol)) redirect("/sin-acceso");
  return session;
}
