import { type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getBoletin } from "@/features/portal/server/consultas";
import { renderBoletinPdf } from "@/features/portal/pdf/boletin-pdf";

/**
 * GET /portal/pdf?estudiante=<uuid>&periodo=<uuid>
 * Descarga el boletín oficial. Mismas reglas de acceso que la vista web:
 * solo periodos cerrados y solo estudiantes que la sesión puede ver.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session || session.debeCambiarPassword) return new Response("Sesión no válida", { status: 401 });

  const params = request.nextUrl.searchParams;
  const estudiante = z.uuid().safeParse(params.get("estudiante") ?? (session.rol === "STUDENT" ? session.userId : ""));
  const periodo = z.uuid().optional().safeParse(params.get("periodo") ?? undefined);
  if (!estudiante.success || !periodo.success) return new Response("Parámetros inválidos", { status: 400 });

  const res = await getBoletin(session, estudiante.data, periodo.data);
  if (res.estado === "sin-acceso") return new Response("No autorizado", { status: 403 });
  if (res.estado === "sin-publicar") return new Response("Aún no hay periodos publicados", { status: 404 });

  const pdf = await renderBoletinPdf(res.data);
  const { estudiante: e, periodo: p, anio } = res.data;
  const archivo = `boletin-${anio}-P${p.numero}-${e.nombre}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .toLowerCase();

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${archivo}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
