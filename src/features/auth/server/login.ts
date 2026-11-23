import "server-only";
import { and, count, desc, eq, gt, min, sql } from "drizzle-orm";
import { db, withTenant } from "@/db/client";
import { institutions, loginAttempts, users, type Rol } from "@/db/schema";
import { verificarPassword } from "@/lib/auth/password";

/** Bloqueo temporal por documento y por IP. */
export const LIMITES = {
  ventanaMin: 15,
  fallosPorDocumento: 5,
  fallosPorIp: 30,
} as const;

export type ResultadoLogin =
  | {
      ok: true;
      userId: string;
      institutionId: string;
      slug: string;
      rol: Rol;
      sesionVersion: number;
      debeCambiarPassword: boolean;
    }
  | { ok: false; error: string };

const ERROR_CREDENCIALES = "Documento o contraseña incorrectos.";

/** "1.045.678.901" o "1045 678 901" → "1045678901" (así se escribe a menudo en Colombia). */
export function normalizarDocumento(documento: string) {
  return documento.replace(/[.\s]/g, "").toUpperCase();
}

const minutosRestantes = (desde: Date | null) =>
  desde ? Math.max(1, Math.ceil(LIMITES.ventanaMin - (Date.now() - desde.getTime()) / 60_000)) : LIMITES.ventanaMin;

export async function autenticar(input: {
  slug: string;
  documento: string;
  password: string;
  ip: string | null;
}): Promise<ResultadoLogin> {
  const [inst] = await db
    .select({ id: institutions.id, slug: institutions.slug })
    .from(institutions)
    .where(and(eq(institutions.slug, input.slug), eq(institutions.activo, true)));
  if (!inst) return { ok: false, error: "La institución no existe o no está activa." };

  const documento = normalizarDocumento(input.documento);
  const ventana = sql`now() - make_interval(mins => ${LIMITES.ventanaMin})`;

  return withTenant({ institutionId: inst.id, userId: "" }, async (tx) => {
    /* 1. ¿Bloqueado? Los fallos cuentan desde el último ingreso exitoso. */
    const [ultimoExito] = await tx
      .select({ en: loginAttempts.createdAt })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.institutionId, inst.id), eq(loginAttempts.documento, documento), eq(loginAttempts.exitoso, true)))
      .orderBy(desc(loginAttempts.createdAt))
      .limit(1);

    const [porDocumento] = await tx
      .select({ fallos: count(), primero: min(loginAttempts.createdAt) })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.institutionId, inst.id),
          eq(loginAttempts.documento, documento),
          eq(loginAttempts.exitoso, false),
          gt(loginAttempts.createdAt, ventana),
          ultimoExito ? gt(loginAttempts.createdAt, ultimoExito.en) : undefined,
        ),
      );
    if (porDocumento.fallos >= LIMITES.fallosPorDocumento) {
      return {
        ok: false,
        error: `Demasiados intentos fallidos. Por seguridad, espere ${minutosRestantes(porDocumento.primero)} min e intente de nuevo.`,
      };
    }

    if (input.ip) {
      const [porIp] = await tx
        .select({ fallos: count() })
        .from(loginAttempts)
        .where(and(sql`${loginAttempts.ip} = ${input.ip}::inet`, eq(loginAttempts.exitoso, false), gt(loginAttempts.createdAt, ventana)));
      if (porIp.fallos >= LIMITES.fallosPorIp) {
        return { ok: false, error: `Demasiados intentos desde esta red. Espere ${LIMITES.ventanaMin} min.` };
      }
    }

    /* 2. Verificar (siempre se ejecuta bcrypt, exista o no el documento). */
    const [user] = await tx
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        rol: users.rol,
        activo: users.activo,
        sesionVersion: users.sesionVersion,
        debeCambiarPassword: users.debeCambiarPassword,
      })
      .from(users)
      .where(and(eq(users.institutionId, inst.id), eq(users.documentoIdentidad, documento)));

    const passwordOk = await verificarPassword(input.password, user?.passwordHash);
    const exitoso = passwordOk && !!user?.activo;

    await tx.insert(loginAttempts).values({
      institutionId: inst.id,
      documento,
      userId: user?.id ?? null,
      ip: input.ip,
      exitoso,
    });

    if (!passwordOk || !user) {
      const quedan = LIMITES.fallosPorDocumento - porDocumento.fallos - 1;
      return {
        ok: false,
        error:
          quedan > 0 && quedan <= 2
            ? `${ERROR_CREDENCIALES} ${quedan === 1 ? "Le queda 1 intento" : `Le quedan ${quedan} intentos`} antes de un bloqueo de ${LIMITES.ventanaMin} minutos.`
            : quedan <= 0
              ? `${ERROR_CREDENCIALES} Por seguridad, el ingreso quedó bloqueado ${LIMITES.ventanaMin} minutos.`
              : ERROR_CREDENCIALES,
      };
    }
    // Solo después de una contraseña correcta se informa que la cuenta está inactiva.
    if (!user.activo) return { ok: false, error: "Su cuenta está desactivada. Comuníquese con la secretaría de la institución." };

    await tx.update(users).set({ ultimoAccesoAt: sql`now()` }).where(eq(users.id, user.id));

    return {
      ok: true,
      userId: user.id,
      institutionId: inst.id,
      slug: inst.slug,
      rol: user.rol,
      sesionVersion: user.sesionVersion,
      debeCambiarPassword: user.debeCambiarPassword,
    };
  });
}
