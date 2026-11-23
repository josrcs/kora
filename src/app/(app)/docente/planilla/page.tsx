import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { getCargaDocente, getPlanilla, periodoPorDefecto, ROLES_LECTURA } from "@/features/planilla/server/queries";
import { PlanillaDocente } from "@/features/planilla/components/planilla-docente";

export const metadata: Metadata = { title: "Planilla de calificaciones" };

/** La planilla depende de la sesión y de la URL: se transmite detrás de <Suspense>. */
export default function PlanillaPage({ searchParams }: PageProps<"/docente/planilla">) {
  return (
    <Suspense fallback={<PlanillaCargando />}>
      <Planilla searchParams={searchParams} />
    </Suspense>
  );
}

async function Planilla({ searchParams }: Pick<PageProps<"/docente/planilla">, "searchParams">) {
  const session = await requireSession(ROLES_LECTURA);
  const params = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  // El docente solo recibe sus asignaciones; coordinación, todas.
  const { asignaciones, periodos } = await getCargaDocente(session);
  if (asignaciones.length === 0 || periodos.length === 0) {
    return (
      <div className="m-6 max-w-xl rounded-2xl border border-line bg-surface p-5">
        <p className="font-medium">No tiene carga académica asignada en el año lectivo activo.</p>
        <p className="mt-1 text-muted">Coordinación asigna las asignaturas y los salones de cada docente.</p>
      </div>
    );
  }

  const asignacion = asignaciones.find((a) => a.id === uno(params.asignacion)) ?? asignaciones[0];
  const periodo = periodos.find((p) => p.id === uno(params.periodo)) ?? periodoPorDefecto(periodos)!;
  const data = await getPlanilla(session, asignacion, periodo);
  if (!data) notFound();

  // La clave incluye las actividades: al crear/editar/eliminar una, la grilla se reconstruye con los datos nuevos.
  const firma = data.actividades.map((a) => `${a.id}:${a.porcentaje}:${a.nombre}`).join("|");
  return (
    <PlanillaDocente
      key={`${asignacion.id}:${periodo.id}:${firma}`}
      data={data}
      asignaciones={asignaciones}
      periodos={periodos}
      esCoordinacion={session.rol === "COORDINATOR"}
    />
  );
}

function PlanillaCargando() {
  return (
    <div className="animate-pulse space-y-4 px-4 py-5 lg:px-6" aria-label="Cargando planilla">
      <div className="h-48 rounded-2xl border border-line bg-surface" />
      <div className="h-16 rounded-2xl border border-line bg-surface" />
      <div className="h-[50vh] rounded-2xl border border-line bg-surface" />
    </div>
  );
}
