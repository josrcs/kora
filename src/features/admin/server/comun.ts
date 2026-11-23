import "server-only";
import { refresh } from "next/cache";
import { randomInt } from "node:crypto";
import type { z } from "zod";
import { errorPostgres } from "@/db/errors";
import { ROLES_ADMINISTRACION, sessionParaAccion, type Session } from "@/lib/auth/session";
import type { EstadoForm } from "../types";

/** Error de negocio con mensaje para el usuario. */
export class Rechazo extends Error {}

export function parsear<T extends z.ZodType>(schema: T, formData: FormData): z.infer<T> {
  const r = schema.safeParse(Object.fromEntries(formData));
  if (!r.success) throw new Rechazo(r.error.issues[0].message);
  return r.data;
}

type Mensajes = {
  /** 23503: el registro está referenciado (no se puede borrar). */
  enUso?: string;
  /** 23505: viola un índice único. */
  duplicado?: string;
};

/**
 * Envoltura de las Server Actions de administración: autoriza (coordinación
 * o administración), ejecuta, traduce los errores de la base a mensajes y
 * refresca la página si todo salió bien.
 */
export async function ejecutar(
  contexto: string,
  fn: (session: Session) => Promise<EstadoForm | string>,
  mensajes: Mensajes = {},
): Promise<EstadoForm> {
  const session = await sessionParaAccion(ROLES_ADMINISTRACION);
  if (!session) return { ok: false, error: "Solo coordinación o administración pueden hacer este cambio." };
  try {
    const r = await fn(session);
    refresh();
    return typeof r === "string" ? { ok: true, error: null, mensaje: r } : r;
  } catch (err) {
    if (err instanceof Rechazo) return { ok: false, error: err.message };
    const pg = errorPostgres(err);
    if (pg?.code === "23503" && mensajes.enUso) return { ok: false, error: mensajes.enUso };
    if (pg?.code === "23505" && mensajes.duplicado) return { ok: false, error: mensajes.duplicado };
    if (pg?.code === "23P01") return { ok: false, error: "Las fechas se cruzan con las de otro periodo del año." };
    if (pg?.code === "23514" || pg?.code === "P0001") return { ok: false, error: pg.message };
    console.error(`[admin] ${contexto}`, err);
    return { ok: false, error: "No se pudo guardar. Intente de nuevo." };
  }
}

/** Clave temporal legible (sin 0/O, 1/l/I) que cumple la política: letras y números. */
export function claveTemporal(): string {
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digitos = "23456789";
  const todos = letras + digitos;
  const chars = [letras[randomInt(letras.length)], digitos[randomInt(digitos.length)]];
  while (chars.length < 10) chars.push(todos[randomInt(todos.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
