import { Suspense } from "react";
import type { Metadata } from "next";
import { requireSession, ROLES_COORDINACION } from "@/lib/auth/session";
import { hoyISO } from "@/lib/fechas";
import { getPeriodosGestion } from "@/features/periodos/server/queries";
import { PeriodoTarjeta } from "@/features/periodos/components/periodo-tarjeta";
import { Cargando, SinAnioActivo } from "@/features/periodos/components/estados";

export const metadata: Metadata = { title: "Periodos" };

export default function PeriodosPage() {
  return (
    <Suspense fallback={<Cargando />}>
      <Periodos />
    </Suspense>
  );
}

async function Periodos() {
  const session = await requireSession(ROLES_COORDINACION);
  const data = await getPeriodosGestion(session);
  if (!data) return <SinAnioActivo />;
  const hoy = hoyISO();
  const totalPct = data.periodos.reduce((s, p) => s + p.porcentaje, 0);

  return (
    <div className="max-w-5xl space-y-3 px-4 py-5 lg:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-base font-semibold tracking-tight">Periodos del año lectivo {data.anio.anio}</h1>
        <p className="text-xs text-muted">
          Cerrar un periodo bloquea las planillas y publica el boletín. Se cierran en orden.
          {totalPct !== 100 && <span className="ml-1 font-medium text-warn">Los periodos suman {totalPct} % (deberían sumar 100 %).</span>}
        </p>
      </div>
      {data.periodos.length === 0 ? (
        <p className="rounded-sm border border-line bg-surface p-4 text-muted">El año lectivo activo no tiene periodos configurados.</p>
      ) : (
        data.periodos.map((p, i) => (
          <PeriodoTarjeta
            key={p.id}
            periodo={p}
            hoy={hoy}
            anteriorAbierto={data.periodos.slice(0, i).find((x) => !x.cerrado)?.nombre ?? null}
          />
        ))
      )}
    </div>
  );
}
