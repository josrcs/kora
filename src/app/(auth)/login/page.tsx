import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_COLEGIO, getSession, rutaInicio } from "@/lib/auth/session";
import { institucionPorSlug, listarInstituciones } from "@/features/auth/server/instituciones";
import { CUENTAS_DEMO, mostrarCuentasDemo } from "@/features/auth/demo";
import { Ingreso } from "@/features/auth/components/ingreso";

export const metadata: Metadata = { title: "Ingreso" };

/**
 * Una sola pantalla: institución, perfil y credenciales. El navegador
 * recuerda el último colegio (cookie) y lo deja preseleccionado.
 */
export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<div className="h-[36rem] w-full max-w-6xl rounded-2xl bg-surface" />}>
      <Pantalla searchParams={searchParams} />
    </Suspense>
  );
}

async function Pantalla({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const session = await getSession();
  if (session) redirect(session.debeCambiarPassword ? "/cambiar-clave" : rutaInicio(session.rol));

  const params = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const slug = uno(params.colegio) ?? (await cookies()).get(COOKIE_COLEGIO)?.value ?? null;

  const instituciones = await listarInstituciones();
  // Si el colegio recordado no está entre las primeras tarjetas, se agrega.
  if (slug && !instituciones.some((i) => i.slug === slug)) {
    const recordado = await institucionPorSlug(slug);
    if (recordado) instituciones.unshift(recordado);
  }

  const politica = uno(params.politica);
  const aviso = politica === "rechazada" || politica === "revocada" ? politica : null;
  return <Ingreso instituciones={instituciones} inicialSlug={slug} cuentasDemo={mostrarCuentasDemo() ? CUENTAS_DEMO : []} avisoPolitica={aviso} />;
}
