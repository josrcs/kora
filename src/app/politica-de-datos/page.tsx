import type { Metadata } from "next";
import Link from "next/link";
import { LogoKora } from "@/components/marca";
import { PoliticaTexto } from "@/features/privacidad/components/politica-texto";

export const metadata: Metadata = {
  title: "Política de tratamiento de datos personales",
  description: "Cómo Kora y las instituciones educativas tratan los datos personales de estudiantes, acudientes y docentes (Ley 1581 de 2012).",
};

/** Página pública: se puede leer antes de tener cuenta. */
export default function PoliticaDatosPage() {
  return (
    <main className="fondo-kora min-h-screen px-4 py-8 sm:py-12">
      <article className="anim-entrar mx-auto max-w-3xl overflow-hidden rounded-3xl bg-surface shadow-elevada ring-1 ring-navy/5">
        <header className="border-b border-line px-6 py-6 sm:px-10">
          <Link href="/login" aria-label="Ir al ingreso de Kora">
            <LogoKora className="h-auto w-48" priority />
          </Link>
          <h1 className="mt-6 text-2xl font-extrabold text-ink sm:text-3xl">Política de Tratamiento de Datos Personales</h1>
          <p className="mt-2 text-sm text-muted">
            Ley 1581 de 2012 · Decreto 1377 de 2013 (Decreto 1074 de 2015) · Ley 1098 de 2006 · Ley 1620 de 2013
          </p>
        </header>
        <div className="px-6 py-8 sm:px-10">
          <PoliticaTexto />
        </div>
        <footer className="border-t border-line bg-canvas px-6 py-4 text-xs text-muted sm:px-10">
          <Link href="/login" className="font-semibold text-brand hover:underline">
            ← Volver al ingreso
          </Link>
        </footer>
      </article>
    </main>
  );
}
