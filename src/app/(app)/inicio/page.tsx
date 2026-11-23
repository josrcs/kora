import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession, rutaInicio } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Inicio" };

/** Punto de entrada de "/": lleva a cada rol a su sección principal (o al ingreso si no hay sesión). */
export default function InicioPage() {
  return (
    <Suspense fallback={null}>
      <Redirigir />
    </Suspense>
  );
}

async function Redirigir(): Promise<null> {
  const session = await requireSession();
  redirect(rutaInicio(session.rol));
}
