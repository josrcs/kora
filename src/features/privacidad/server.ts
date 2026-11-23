import "server-only";
import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { withTenant, type TenantContext, type Tx } from "@/db/client";
import { dataConsents } from "@/db/schema";
import { ipCliente } from "@/lib/http";
import { VERSION_POLITICA } from "./politica";

/** Agrega una fila al registro (inmutable) de aceptaciones, rechazos y revocatorias. */
export async function registrarDecision(ctx: TenantContext, aceptado: boolean) {
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  const ip = await ipCliente();
  await withTenant(ctx, (tx) =>
    tx.insert(dataConsents).values({
      institutionId: ctx.institutionId,
      userId: ctx.userId,
      tipo: "ACEPTACION_USUARIO",
      version: VERSION_POLITICA,
      aceptado,
      registradoPor: ctx.userId,
      ip,
      userAgent: ua,
    }),
  );
}

/** Autorización del representante legal de un estudiante, registrada por la secretaría al matricular. */
export async function registrarAutorizacionRepresentante(
  tx: Tx,
  d: { institutionId: string; estudianteId: string; registradoPor: string; nombre: string; documento: string; parentesco: string },
) {
  await tx.insert(dataConsents).values({
    institutionId: d.institutionId,
    userId: d.estudianteId,
    tipo: "AUTORIZACION_REPRESENTANTE",
    version: VERSION_POLITICA,
    aceptado: true,
    representanteNombre: d.nombre,
    representanteDocumento: d.documento,
    representanteParentesco: d.parentesco,
    registradoPor: d.registradoPor,
    ip: await ipCliente(),
  });
}

/** Historial del propio usuario (para la página de privacidad). */
export async function historialPropio(ctx: TenantContext) {
  return withTenant(ctx, (tx) =>
    tx
      .select({
        tipo: dataConsents.tipo,
        version: dataConsents.version,
        aceptado: dataConsents.aceptado,
        representante: dataConsents.representanteNombre,
        parentesco: dataConsents.representanteParentesco,
        fecha: dataConsents.createdAt,
      })
      .from(dataConsents)
      .where(and(eq(dataConsents.userId, ctx.userId), eq(dataConsents.institutionId, ctx.institutionId)))
      .orderBy(desc(dataConsents.createdAt))
      .limit(20),
  );
}
