"use server";

import { redirect } from "next/navigation";
import { ipCliente } from "@/lib/http";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/db/client";
import { users } from "@/db/schema";
import { createSession, getSession, rutaInicio } from "@/lib/auth/session";
import { hashPassword, problemaPassword, verificarPassword } from "@/lib/auth/password";
import { autenticar } from "./server/login";
import { PERFILES, perfilDeRol, type PerfilId } from "./demo";

export type EstadoFormulario = { error: string | null; documento?: string; campo?: string };

/* ------------------------------------------------------------------ */
/*  Ingreso                                                            */
/* ------------------------------------------------------------------ */
const loginSchema = z.object({
  slug: z.string({ error: "Seleccione su institución educativa." }).regex(/^[a-z0-9-]{1,60}$/, "Seleccione su institución educativa."),
  documento: z.string().trim().min(1, "Digite su número de documento.").max(30),
  password: z.string().min(1, "Digite su contraseña.").max(200),
  perfil: z.enum(PERFILES.map((p) => p.id) as [PerfilId, ...PerfilId[]]).optional(),
});

export async function iniciarSesion(_prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const parsed = loginSchema.safeParse({
    slug: formData.get("slug") ?? undefined,
    documento: formData.get("documento"),
    password: formData.get("password"),
    perfil: formData.get("perfil") || undefined,
  });
  const documento = String(formData.get("documento") ?? "").slice(0, 30);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const amigable = issue.message.startsWith("Digite") || issue.message.startsWith("Seleccione");
    return { error: amigable ? issue.message : "Datos inválidos.", documento, campo: String(issue.path[0]) };
  }

  const res = await autenticar({ ...parsed.data, ip: await ipCliente() });
  if (!res.ok) return { error: res.error, documento, campo: "password" };

  // El perfil elegido debe corresponder al rol de la cuenta (solo se informa tras una contraseña correcta).
  const perfil = parsed.data.perfil && PERFILES.find((p) => p.id === parsed.data.perfil);
  if (perfil && !(perfil.roles as readonly string[]).includes(res.rol)) {
    const correcto = PERFILES.find((p) => p.id === perfilDeRol(res.rol))!;
    return { error: `Esta cuenta no es de ${perfil.texto.toLowerCase()}: elija el perfil «${correcto.texto}».`, documento, campo: "perfil" };
  }

  await createSession(res);
  // redirect() lanza una excepción de control: va fuera de cualquier try/catch.
  redirect(res.debeCambiarPassword ? "/cambiar-clave" : rutaInicio(res.rol));
}

/*  La salida NO es un Server Action: ver app/salir/route.ts (recarga completa). */

/* ------------------------------------------------------------------ */
/*  Cambio de contraseña (obligatorio con clave temporal)              */
/* ------------------------------------------------------------------ */
const cambioSchema = z.object({
  actual: z.string().min(1, "Digite su contraseña actual.").max(200),
  nueva: z.string().max(200),
  confirmacion: z.string().max(200),
});

export async function cambiarClave(_prev: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const session = await getSession();
  if (!session) redirect("/login");

  const parsed = cambioSchema.safeParse({
    actual: formData.get("actual"),
    nueva: formData.get("nueva"),
    confirmacion: formData.get("confirmacion"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message, campo: String(parsed.error.issues[0].path[0]) };
  const { actual, nueva, confirmacion } = parsed.data;

  type Resultado = { ok: true; sesionVersion: number } | { ok: false; error: string; campo: string };
  const resultado = await withTenant(session, async (tx): Promise<Resultado> => {
    const [user] = await tx
      .select({ hash: users.passwordHash, documento: users.documentoIdentidad })
      .from(users)
      .where(eq(users.id, session.userId));
    if (!user || !(await verificarPassword(actual, user.hash))) {
      return { ok: false, error: "La contraseña actual no es correcta.", campo: "actual" };
    }
    const problema = problemaPassword(nueva, user.documento);
    if (problema) return { ok: false, error: problema, campo: "nueva" };
    if (nueva !== confirmacion) {
      return { ok: false, error: "La confirmación no coincide con la nueva contraseña.", campo: "confirmacion" };
    }
    if (await verificarPassword(nueva, user.hash)) {
      return { ok: false, error: "La nueva contraseña debe ser distinta de la actual.", campo: "nueva" };
    }

    // Subir la versión de sesión cierra las sesiones abiertas en otros equipos.
    const [act] = await tx
      .update(users)
      .set({
        passwordHash: await hashPassword(nueva),
        debeCambiarPassword: false,
        sesionVersion: sql`${users.sesionVersion} + 1`,
      })
      .where(eq(users.id, session.userId))
      .returning({ sesionVersion: users.sesionVersion });
    return { ok: true, sesionVersion: act.sesionVersion };
  });

  if (!resultado.ok) return { error: resultado.error, campo: resultado.campo };

  // Este equipo continúa con una sesión nueva.
  await createSession({
    institutionId: session.institutionId,
    userId: session.userId,
    sesionVersion: resultado.sesionVersion,
    slug: session.institucion.slug,
  });
  redirect(rutaInicio(session.rol));
}
