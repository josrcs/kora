"use server";

import { redirect } from "next/navigation";
import { destroySession, getSession, rutaInicio } from "@/lib/auth/session";
import { registrarDecision } from "./server";

export type EstadoAutorizacion = { error: string | null };

/**
 * Aceptar la política. Se exigen las casillas (consentimiento expreso, no
 * casillas premarcadas): sin ellas no se registra nada.
 */
export async function aceptarPolitica(_prev: EstadoAutorizacion, formData: FormData): Promise<EstadoAutorizacion> {
  const session = await getSession();
  if (!session) redirect("/login");

  if (formData.get("leida") !== "on") return { error: "Debe marcar que leyó la política de tratamiento de datos." };
  if (formData.get("autoriza") !== "on") return { error: "Debe marcar la autorización para continuar." };
  if (session.rol === "GUARDIAN" && formData.get("representante") !== "on") {
    return { error: "Como acudiente, confirme que es representante legal (o está autorizado) de los estudiantes a su cargo." };
  }

  await registrarDecision(session, true);
  redirect(session.debeCambiarPassword ? "/cambiar-clave" : rutaInicio(session.rol));
}

/** No acepta: queda registrado, se cierra la sesión y la cuenta no se activa. */
export async function rechazarPolitica() {
  const session = await getSession();
  if (!session) redirect("/login");
  await registrarDecision(session, false);
  await destroySession();
  redirect("/login?politica=rechazada");
}

/** Revocar una autorización ya dada (art. 8 lit. e, Ley 1581). La próxima vez deberá aceptarla de nuevo para entrar. */
export async function revocarAutorizacion() {
  const session = await getSession();
  if (!session) redirect("/login");
  await registrarDecision(session, false);
  await destroySession();
  redirect("/login?politica=revocada");
}
