import { type NextRequest } from "next/server";
import { destroySession } from "@/lib/auth/session";

/**
 * POST /salir · cierra la sesión con una navegación COMPLETA del navegador.
 *
 * No es un Server Action a propósito: con una navegación del lado del cliente,
 * el router de Next conserva en memoria (y en el DOM oculto) las páginas que
 * vio el usuario anterior. En un computador compartido del colegio, el
 * siguiente usuario podría recuperarlas. La respuesta 303 obliga a recargar.
 */
export async function POST(request: NextRequest) {
  // La cookie de sesión es SameSite=Lax: un formulario de otro sitio no la envía. Aun así, se exige mismo origen.
  const origen = request.headers.get("origin");
  if (origen && origen !== request.nextUrl.origin) return new Response("Origen no permitido", { status: 403 });
  await destroySession();
  return new Response(null, {
    status: 303,
    headers: {
      Location: "/login",
      "Cache-Control": "no-store",
      // Borra lo que el navegador haya guardado de esta app (caché HTTP; las cookies de sesión ya se eliminaron).
      "Clear-Site-Data": '"cache"',
    },
  });
}
