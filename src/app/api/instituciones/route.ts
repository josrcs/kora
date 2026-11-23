import { type NextRequest } from "next/server";
import { buscarInstituciones } from "@/features/auth/server/instituciones";

/**
 * Búsqueda pública para el selector de institución (antes de iniciar sesión).
 * GET /api/instituciones?q=jorge isaacs   ó   ?q=108001 (código DANE)
 * Es un Route Handler y no un Server Action porque se llama mientras el usuario
 * escribe: admite peticiones en paralelo y cancelación con AbortController.
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
  const resultados = await buscarInstituciones(q);
  return Response.json(resultados, {
    headers: { "Cache-Control": "public, max-age=60" },
  });
}
