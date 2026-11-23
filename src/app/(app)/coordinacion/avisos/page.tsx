import { Suspense } from "react";
import type { Metadata } from "next";
import { requireSession, ROLES_COORDINACION } from "@/lib/auth/session";
import { avisosDeCoordinacion } from "@/features/avisos/server";
import { AvisoTarjeta } from "@/features/avisos/components/aviso-tarjeta";
import { AccionesAviso, FormAviso } from "@/features/avisos/components/form-aviso";
import { Cargando } from "@/features/periodos/components/estados";

export const metadata: Metadata = { title: "Avisos y comunicados" };

export default function AvisosCoordinacionPage() {
  return (
    <div className="grid max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:px-6">
      <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
        <FormAviso />
        <p className="px-1 text-xs leading-5 text-muted">
          Los avisos aparecen en el portal de cada estudiante y acudiente. Los urgentes y fijados se muestran también al abrir el boletín.
          No incluya datos personales ni de convivencia de un estudiante en un aviso general.
        </p>
      </div>
      <Suspense fallback={<Cargando />}>
        <Lista />
      </Suspense>
    </div>
  );
}

async function Lista() {
  const session = await requireSession(ROLES_COORDINACION);
  const avisos = await avisosDeCoordinacion(session);
  if (avisos.length === 0) {
    return <p className="rounded-2xl border border-dashed border-line-strong bg-surface px-5 py-8 text-center text-muted">Aún no ha publicado avisos.</p>;
  }
  return (
    <section aria-label="Publicados" className="anim-escalonado space-y-3">
      {avisos.map((a) => {
        const pct = a.destinatarios ? Math.round((a.leidos / a.destinatarios) * 100) : 0;
        return (
          <AvisoTarjeta
            key={a.id}
            aviso={a}
            atenuado={a.archivado}
            pie={
              <>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-muted">
                    <span>{a.archivado ? "Archivado · no visible en el portal" : "Acuse de lectura"}</span>
                    <span className="font-semibold text-ink-soft">
                      {a.leidos.toLocaleString("es-CO")} de {a.destinatarios.toLocaleString("es-CO")} ({pct} %)
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand to-cielo transition-all duration-700" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <AccionesAviso id={a.id} fijado={a.fijado} archivado={a.archivado} />
              </>
            }
          />
        );
      })}
    </section>
  );
}
