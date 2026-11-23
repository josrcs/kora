import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { IconAlert, IconLock } from "@/components/icons";
import { requireSession, ROLES_COORDINACION } from "@/lib/auth/session";
import { diasEntre, fechaCorta, hoyISO, porcentajeAvance, relativoDias } from "@/lib/fechas";
import { DESEMPENO_LABEL, type DesempenoCodigo } from "@/lib/grading/calc";
import { getDashboard, UMBRAL_RIESGO, type Dashboard } from "@/features/dashboard/server/dashboard";
import { DistribucionGrupos, LeyendaDesempeno, ReprobacionAsignaturas } from "@/features/dashboard/components/graficos";
import { BarraAvance } from "@/features/periodos/components/barra-avance";
import { Cargando, SinAnioActivo } from "@/features/periodos/components/estados";

export const metadata: Metadata = { title: "Coordinación" };

const NIVELES: DesempenoCodigo[] = ["BAJO", "BASICO", "ALTO", "SUPERIOR"];

export default function CoordinacionPage({ searchParams }: PageProps<"/coordinacion">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Resumen searchParams={searchParams} />
    </Suspense>
  );
}

async function Resumen({ searchParams }: Pick<PageProps<"/coordinacion">, "searchParams">) {
  const session = await requireSession(ROLES_COORDINACION);
  const params = await searchParams;
  const periodoId = Array.isArray(params.periodo) ? params.periodo[0] : params.periodo;
  const data = await getDashboard(session, periodoId);
  if (!data) return <SinAnioActivo />;
  const { periodo, resumen } = data;

  return (
    <div className="max-w-5xl space-y-5 px-4 py-5 lg:px-6">
      {data.enCurso && <TarjetaEnCurso enCurso={data.enCurso} hoy={hoyISO()} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Resultados académicos · {periodo.nombre}</h1>
          {!periodo.cerrado && (
            <p className="text-xs text-warn">Periodo abierto: las cifras son parciales y cambian mientras los docentes digitan.</p>
          )}
        </div>
        <nav aria-label="Periodo analizado" className="flex h-8 rounded-sm border border-line-strong bg-surface">
          {data.periodos.map((p, i) => (
            <Link
              key={p.id}
              href={`/coordinacion?periodo=${p.id}`}
              aria-current={p.id === periodo.id ? "page" : undefined}
              className={`flex items-center gap-1.5 px-3 ${i > 0 ? "border-l border-line-strong" : ""} ${
                p.id === periodo.id ? "bg-brand font-medium text-white" : "text-ink-soft hover:bg-slate-50"
              }`}
            >
              {p.cerrado && <IconLock className="size-3" />}
              {p.nombre}
            </Link>
          ))}
        </nav>
      </div>

      {resumen.notas === 0 ? (
        <p className="rounded-sm border border-line bg-surface p-4 text-muted">Aún no hay calificaciones registradas en {periodo.nombre.toLowerCase()}.</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line md:grid-cols-4">
            <Dato titulo="Promedio institucional" valor={resumen.promedio?.toFixed(data.decimales) ?? "—"} detalle={`${resumen.estudiantes} estudiantes`} />
            <Dato
              titulo="Notas en desempeño bajo"
              valor={`${Math.round((resumen.enBajo / resumen.notas) * 100)} %`}
              detalle={`${resumen.enBajo.toLocaleString("es-CO")} de ${resumen.notas.toLocaleString("es-CO")}`}
            />
            <Dato
              titulo={`${UMBRAL_RIESGO}+ asignaturas en bajo`}
              valor={String(data.riesgo.length)}
              detalle="estudiantes, acumulado del año"
              alerta={data.riesgo.length > 0}
            />
            <Dato titulo="1 o 2 asignaturas en bajo" valor={String(data.enRiesgoLeve)} detalle="estudiantes, acumulado del año" />
          </dl>

          <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
            <Panel
              titulo="Desempeño por grupo"
              subtitulo={`Reparto de las notas de ${periodo.nombre.toLowerCase()} · aprueba desde ${data.aprobatoria.toFixed(data.decimales)}`}
              extra={<LeyendaDesempeno />}
              tabla={<TablaGrupos data={data} />}
            >
              <DistribucionGrupos grupos={data.grupos} decimales={data.decimales} />
            </Panel>
            <Panel
              titulo="Reprobación por asignatura"
              subtitulo="Porcentaje de notas en desempeño bajo"
              tabla={<TablaAsignaturas data={data} />}
            >
              <ReprobacionAsignaturas asignaturas={data.asignaturas} />
            </Panel>
          </div>

          <Riesgo data={data} />
        </>
      )}
    </div>
  );
}

function TarjetaEnCurso({ enCurso: e, hoy }: { enCurso: NonNullable<Dashboard["enCurso"]>; hoy: string }) {
  const dias = e.fechaLimiteNotas ? diasEntre(hoy, e.fechaLimiteNotas) : null;
  const pct = porcentajeAvance(e.conNota, e.celdas);
  return (
    <section aria-label="Digitación en curso" className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-sm border border-line bg-surface px-4 py-3">
      <div className="min-w-56 flex-1">
        <p className="text-xs text-muted">Digitación de {e.nombre.toLowerCase()}</p>
        <p className="mt-0.5 flex items-baseline gap-2">
          <span className="text-2xl font-semibold">{pct} %</span>
          <span className="text-xs text-muted tabular-nums">
            {e.conNota.toLocaleString("es-CO")} de {e.celdas.toLocaleString("es-CO")} calificaciones
          </span>
        </p>
        <BarraAvance hecho={e.conNota} total={e.celdas} className="mt-2 max-w-md" />
      </div>
      <div className="text-xs">
        {e.fechaLimiteNotas && dias !== null && (
          <p className={dias < 0 ? "font-medium text-bad" : dias <= 7 ? "font-medium text-warn" : "text-muted"}>
            Plazo: {fechaCorta(e.fechaLimiteNotas)} ({dias < 0 ? "venció " : ""}
            {relativoDias(dias)})
          </p>
        )}
        <p className="mt-1 text-ink-soft">
          {e.docentesConPendientes === 0
            ? `Los ${e.docentes} docentes están al día.`
            : `${e.docentesConPendientes} de ${e.docentes} docentes con calificaciones pendientes.`}
        </p>
      </div>
      <div className="flex gap-2">
        <Link href={`/coordinacion/seguimiento?periodo=${e.id}`} className="flex h-8 items-center rounded-sm border border-line-strong px-3 font-medium text-ink-soft hover:bg-slate-50">
          Ver pendientes
        </Link>
        <Link href="/coordinacion/periodos" className="flex h-8 items-center rounded-sm bg-brand px-3 font-medium text-white hover:bg-brand-hover">
          Gestionar periodos
        </Link>
      </div>
    </section>
  );
}

function Dato({ titulo, valor, detalle, alerta }: { titulo: string; valor: string; detalle?: string; alerta?: boolean }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="flex items-center gap-1 text-xs text-muted">
        {alerta && <IconAlert className="size-3.5 text-bad" aria-label="Requiere atención" />}
        {titulo}
      </dt>
      <dd className="mt-0.5 text-xl font-semibold">{valor}</dd>
      {detalle && <dd className="text-xs text-muted">{detalle}</dd>}
    </div>
  );
}

function Panel({
  titulo,
  subtitulo,
  extra,
  tabla,
  children,
}: {
  titulo: string;
  subtitulo: string;
  extra?: React.ReactNode;
  tabla: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={titulo} className="flex flex-col rounded-sm border border-line bg-surface">
      <div className="space-y-2 px-4 pt-3 pb-3">
        <div>
          <h2 className="font-semibold tracking-tight">{titulo}</h2>
          <p className="text-xs text-muted">{subtitulo}</p>
        </div>
        {extra}
      </div>
      <div className="flex-1 px-4 pb-4">{children}</div>
      <details className="border-t border-line px-4 py-2 text-xs">
        <summary className="cursor-pointer text-muted hover:text-ink">Ver como tabla</summary>
        <div className="mt-2 overflow-x-auto pb-1">{tabla}</div>
      </details>
    </section>
  );
}

const th = "px-2 py-1 text-right font-medium first:pl-0 first:text-left";
const td = "px-2 py-1 text-right tabular-nums first:pl-0 first:text-left";

function TablaGrupos({ data }: { data: Dashboard }) {
  return (
    <table className="w-full">
      <thead className="text-muted">
        <tr>
          <th className={th}>Grupo</th>
          {NIVELES.map((n) => (
            <th key={n} className={th}>{DESEMPENO_LABEL[n]}</th>
          ))}
          <th className={th}>Notas</th>
          <th className={th}>Promedio</th>
        </tr>
      </thead>
      <tbody>
        {data.grupos.map((g) => (
          <tr key={g.id} className="border-t border-line">
            <td className={td}>{g.codigo}</td>
            {NIVELES.map((n) => (
              <td key={n} className={td}>
                {g.conteo[n]} <span className="text-muted">({g.total ? Math.round((g.conteo[n] / g.total) * 100) : 0} %)</span>
              </td>
            ))}
            <td className={td}>{g.total}</td>
            <td className={td}>{g.promedio?.toFixed(data.decimales) ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TablaAsignaturas({ data }: { data: Dashboard }) {
  return (
    <table className="w-full">
      <thead className="text-muted">
        <tr>
          <th className={th}>Asignatura</th>
          <th className={th}>En bajo</th>
          <th className={th}>Notas</th>
          <th className={th}>%</th>
        </tr>
      </thead>
      <tbody>
        {data.asignaturas.map((a) => (
          <tr key={a.nombre} className="border-t border-line">
            <td className={td}>{a.nombre}</td>
            <td className={td}>{a.reprobadas}</td>
            <td className={td}>{a.total}</td>
            <td className={td}>{a.total ? Math.round((a.reprobadas / a.total) * 100) : 0} %</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Riesgo({ data }: { data: Dashboard }) {
  return (
    <section aria-labelledby="riesgo" className="rounded-sm border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 id="riesgo" className="font-semibold tracking-tight">
          Estudiantes con {UMBRAL_RIESGO} o más asignaturas en desempeño bajo
        </h2>
        <p className="text-xs text-muted">
          Según el acumulado del año hasta {data.periodo.nombre.toLowerCase()} (mismo cálculo del boletín). Candidatos a plan de
          mejoramiento y citación de acudientes.
        </p>
      </div>
      {data.riesgo.length === 0 ? (
        <p className="px-4 py-3 text-ok">Ningún estudiante tiene {UMBRAL_RIESGO} o más asignaturas en desempeño bajo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-1.5 font-medium">Estudiante</th>
                <th scope="col" className="px-2 py-1.5 font-medium">Grupo</th>
                <th scope="col" className="px-2 py-1.5 text-right font-medium">En bajo</th>
                <th scope="col" className="px-4 py-1.5 font-medium">Asignaturas</th>
              </tr>
            </thead>
            <tbody>
              {data.riesgo.slice(0, 50).map((e) => (
                <tr key={e.studentId} className="border-t border-line align-top">
                  <td className="px-4 py-1.5 font-medium">{e.nombre}</td>
                  <td className="px-2 py-1.5 tabular-nums">{e.grupo}</td>
                  <td className="px-2 py-1.5 text-right font-medium text-bad tabular-nums">{e.asignaturas.length}</td>
                  <td className="px-4 py-1.5 text-ink-soft">{e.asignaturas.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.riesgo.length > 50 && (
            <p className="border-t border-line px-4 py-2 text-xs text-muted">
              Se muestran los 50 casos más críticos de {data.riesgo.length}. El detalle por grado y salón está en{" "}
              <Link href="/coordinacion/corte" className="font-medium text-brand hover:underline">Corte preventivo</Link>.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
