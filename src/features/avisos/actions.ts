"use server";

import { refresh } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { withTenant } from "@/db/client";
import { announcements } from "@/db/schema";
import { ROLES_COORDINACION, sessionParaAccion } from "@/lib/auth/session";

export type EstadoAviso = { ok: boolean; error: string | null; mensaje?: string };

const avisoSchema = z.object({
  titulo: z.string().trim().min(3, "El título debe tener al menos 3 caracteres.").max(140, "Título de máximo 140 caracteres."),
  cuerpo: z.string().trim().min(10, "Escriba el mensaje (al menos 10 caracteres).").max(5000, "Mensaje de máximo 5.000 caracteres."),
  tipo: z.enum(["AVISO", "COMUNICADO", "URGENTE"]),
  audiencia: z.enum(["TODOS", "ESTUDIANTES", "ACUDIENTES"]),
  fijado: z.literal("on").optional(),
});

/** Publica un aviso o comunicado para estudiantes y/o acudientes (solo coordinación). */
export async function publicarAviso(_prev: EstadoAviso, formData: FormData): Promise<EstadoAviso> {
  const session = await sessionParaAccion(ROLES_COORDINACION);
  if (!session) return { ok: false, error: "Solo coordinación publica avisos y comunicados." };
  const parsed = avisoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  await withTenant(session, (tx) =>
    tx.insert(announcements).values({
      institutionId: session.institutionId,
      autorId: session.userId,
      titulo: d.titulo,
      cuerpo: d.cuerpo,
      tipo: d.tipo,
      audiencia: d.audiencia,
      fijado: d.fijado === "on",
    }),
  );
  refresh();
  return { ok: true, error: null, mensaje: "Publicado. Ya lo ven los destinatarios en su portal." };
}

const idSchema = z.uuid();

/** Archivar retira el aviso del portal (queda en el historial de coordinación); desarchivar lo vuelve a mostrar. */
export async function archivarAviso(id: string, archivar: boolean) {
  const session = await sessionParaAccion(ROLES_COORDINACION);
  if (!session || !idSchema.safeParse(id).success) return;
  await withTenant(session, (tx) =>
    tx
      .update(announcements)
      .set({ archivadoAt: archivar ? sql`now()` : null })
      .where(and(eq(announcements.id, id), eq(announcements.institutionId, session.institutionId))),
  );
  refresh();
}

export async function fijarAviso(id: string, fijado: boolean) {
  const session = await sessionParaAccion(ROLES_COORDINACION);
  if (!session || !idSchema.safeParse(id).success) return;
  await withTenant(session, (tx) =>
    tx
      .update(announcements)
      .set({ fijado })
      .where(and(eq(announcements.id, id), eq(announcements.institutionId, session.institutionId))),
  );
  refresh();
}
