import { Suspense } from "react";
import type { Metadata } from "next";
import { requireSession, ROLES_ADMINISTRACION } from "@/lib/auth/session";
import { hoyISO } from "@/lib/fechas";
import { getAnios } from "@/features/admin/server/anios";
import { NuevoAnio, TarjetaAnio } from "@/features/admin/components/anios-admin";
import { Cargando } from "@/features/periodos/components/estados";

export const metadata: Metadata = { title: "Años y periodos" };

export default function AniosPage() {
  return (
    <Suspense fallback={<Cargando />}>
      <Anios />
    </Suspense>
  );
}

async function Anios() {
  const session = await requireSession(ROLES_ADMINISTRACION);
  const anios = await getAnios(session);
  const sugerido = Math.max(Number(hoyISO().slice(0, 4)), ...anios.map((a) => a.anio + 1));

  return (
    <div className="max-w-5xl space-y-4 px-4 py-5 lg:px-6">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Años lectivos y periodos</h1>
        <p className="text-xs text-muted">
          Prepare el año siguiente (periodos y grupos) y actívelo cuando empiecen las clases; la carga académica y las matrículas se hacen
          sobre el año activo. Solo un año está activo a la vez.
        </p>
      </div>
      <NuevoAnio sugerido={sugerido} />
      {anios.length === 0 ? (
        <p className="rounded-sm border border-line bg-surface p-4 text-muted">Todavía no hay años lectivos. Cree el primero.</p>
      ) : (
        anios.map((a) => <TarjetaAnio key={a.id} anio={a} />)
      )}
    </div>
  );
}
