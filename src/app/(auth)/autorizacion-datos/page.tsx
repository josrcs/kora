import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession, rutaInicio } from "@/lib/auth/session";
import { LogoKora } from "@/components/marca";
import { IconEscudo } from "@/components/icons";
import { AutorizacionForm } from "@/features/privacidad/components/autorizacion-form";
import { PoliticaTexto } from "@/features/privacidad/components/politica-texto";

export const metadata: Metadata = { title: "Autorización de datos personales" };

/** Paso obligatorio antes de activar la cuenta: sin aceptar la política no se usa Kora. */
export default function AutorizacionPage() {
  return (
    <div className="w-full max-w-3xl">
      <Suspense fallback={<div className="h-[36rem] rounded-3xl bg-surface" />}>
        <Contenido />
      </Suspense>
    </div>
  );
}

async function Contenido() {
  const session = await requireSession(undefined, { permitirPoliticaPendiente: true, permitirClavePendiente: true });
  if (session.politicaAceptada) redirect(session.debeCambiarPassword ? "/cambiar-clave" : rutaInicio(session.rol));
  const nombre = session.nombre.split(" ")[0];
  const esEstudiante = session.rol === "STUDENT";

  return (
    <div className="overflow-hidden rounded-3xl bg-surface shadow-elevada ring-1 ring-navy/5">
      <div className="panel-kora flex flex-wrap items-center justify-between gap-4 px-6 py-5 text-white sm:px-8">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-white/10 text-cielo ring-1 ring-white/15">
            <IconEscudo className="size-6" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-blue-200/80 uppercase">Antes de empezar</p>
            <h1 className="text-xl font-bold">Tus datos, tus derechos</h1>
          </div>
        </div>
        <p className="text-xs text-blue-100/70">{session.institucion.nombre}</p>
      </div>

      <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <p className="text-base leading-6 text-ink">
            Hola, <strong>{nombre}</strong>.{" "}
            {esEstudiante
              ? "Kora guarda tus notas, tu nota de convivencia y los avisos del colegio. Antes de usarla, lee cómo cuidamos tu información."
              : "Para activar su cuenta debe leer y aceptar la política de tratamiento de datos personales de la institución."}
          </p>
          <div className="max-h-[22rem] overflow-y-auto rounded-2xl border border-line bg-canvas px-5 py-4">
            <PoliticaTexto compacta />
          </div>
        </div>
        <div className="space-y-4">
          <LogoKora className="mx-auto h-auto w-44 max-lg:hidden" />
          <ul className="anim-escalonado space-y-2 text-[13px] leading-5 text-ink-soft">
            {[
              "Solo tú y tu acudiente ven tus notas y tu convivencia.",
              "El colegio no comparte tus datos con terceros sin autorización.",
              "Puedes consultar, corregir o revocar tu autorización.",
            ].map((t) => (
              <li key={t} className="flex gap-2 rounded-xl bg-cielo-soft px-3 py-2">
                <span aria-hidden className="text-brand">✓</span>
                {t}
              </li>
            ))}
          </ul>
          <AutorizacionForm rol={session.rol} />
        </div>
      </div>
    </div>
  );
}
