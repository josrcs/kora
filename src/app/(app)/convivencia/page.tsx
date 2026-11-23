import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SelectorGrupo } from "@/components/selector-grupo";
import { requireSession, ROLES_CONVIVENCIA, ROLES_PROCESOS } from "@/lib/auth/session";
import { fechaCorta } from "@/lib/fechas";
import { SITUACION, TIPO_ANOTACION } from "@/features/portal/formato";
import { getConvivencia } from "@/features/convivencia/server/queries";
import { ListaAnotaciones, NuevaAnotacion } from "@/features/convivencia/components/convivencia";
import { Cargando, SinAnioActivo } from "@/features/periodos/components/estados";

export const metadata: Metadata = { title: "Convivencia" };

export default function ConvivenciaPage({ searchParams }: PageProps<"/convivencia">) {
  return (
    <>
      <div className="border-b border-line bg-surface px-4 py-4 lg:px-6">
        <p className="text-xs text-muted">Convivencia escolar · Ley 1620 de 2013</p>
        <h1 className="text-base font-semibold tracking-tight">Observador del estudiante</h1>
      </div>
      <Suspense fallback={<Cargando />}>
        <Convivencia searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Convivencia({ searchParams }: Pick<PageProps<"/convivencia">, "searchParams">) {
  const session = await requireSession(ROLES_CONVIVENCIA);
  const params = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const data = await getConvivencia(session, uno(params.grupo), uno(params.estudiante));
  if (!data) return <SinAnioActivo />;
  const puedeProcesos = (ROLES_PROCESOS as readonly string[]).includes(session.rol);
  const { grupo, estudiante } = data;

  return (
    <div className="max-w-6xl space-y-4 px-4 py-5 lg:px-6">
      {session.rol === "RECTOR" && (
        <p className="rounded-sm border border-line bg-surface px-4 py-2 text-xs text-ink-soft">
          Como rector puede registrar anotaciones en el observador. La apertura y el cierre de procesos disciplinarios corresponden a
          coordinación.
        </p>
      )}

      <section aria-labelledby="procesos" className="rounded-sm border border-line bg-surface">
        <h2 id="procesos" className="border-b border-line px-4 py-2 font-semibold tracking-tight">
          Procesos disciplinarios abiertos <span className="font-normal text-muted">({data.procesosAbiertos.length})</span>
        </h2>
        {data.procesosAbiertos.length === 0 ? (
          <p className="px-4 py-3 text-muted">No hay procesos abiertos.</p>
        ) : (
          <ul>
            {data.procesosAbiertos.map((p) => (
              <li key={p.id} className="border-t border-line first:border-t-0">
                <Link
                  href={`/convivencia?grupo=${p.groupId}&estudiante=${p.studentId}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 hover:bg-slate-50"
                >
                  <span className="font-medium">{p.estudiante}</span>
                  <span className="text-muted tabular-nums">{p.grupo}</span>
                  <span className="text-xs text-ink-soft">
                    {TIPO_ANOTACION[p.tipo]}
                    {p.situacion && ` · ${SITUACION[p.situacion]}`}
                  </span>
                  <span className="ml-auto text-xs text-muted">desde {fechaCorta(p.fecha, true)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SelectorGrupo
        grupos={data.grupos.map((g) => ({ ...g, alerta: g.procesosAbiertos > 0, detalle: g.procesosAbiertos ? `· ${g.procesosAbiertos} abiertos` : undefined }))}
        actualId={grupo?.id ?? null}
        href={(id) => `/convivencia${id ? `?grupo=${id}` : ""}`}
      />

      {grupo && (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <nav aria-label={`Estudiantes de ${grupo.codigo}`} className="max-h-[70vh] overflow-y-auto rounded-sm border border-line bg-surface">
            <ul>
              {data.estudiantes.map((e) => (
                <li key={e.id} className="border-t border-line first:border-t-0">
                  <Link
                    href={`/convivencia?grupo=${grupo.id}&estudiante=${e.id}`}
                    aria-current={e.id === estudiante?.id ? "page" : undefined}
                    className={`flex items-center justify-between gap-2 px-3 py-1.5 ${e.id === estudiante?.id ? "bg-brand-soft font-medium text-brand" : "hover:bg-slate-50"}`}
                  >
                    <span className="truncate">{e.nombre}</span>
                    <span className="shrink-0 text-xs text-muted tabular-nums">
                      {e.procesosAbiertos > 0 && <span className="text-warn">● </span>}
                      {e.anotaciones || ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="min-w-0 space-y-4">
            {estudiante ? (
              <>
                <NuevaAnotacion key={estudiante.id} studentId={estudiante.id} estudiante={estudiante.nombre} puedeAbrirProceso={puedeProcesos} />
                <ListaAnotaciones anotaciones={data.anotaciones} puedeCerrar={puedeProcesos} />
              </>
            ) : (
              <p className="rounded-sm border border-line bg-surface px-4 py-3 text-muted">Elija un estudiante para ver su observador o registrar una anotación.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
