import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { IconLock } from "@/components/icons";
import { withTenant } from "@/db/client";
import { requireSession, ROLES_RECTORIA } from "@/lib/auth/session";
import { leerEscala } from "@/lib/grading/escala.server";
import { getRectoria } from "@/features/rectoria/server/rectoria";
import { PromediosCursos } from "@/features/rectoria/components/promedios-cursos";
import { Cargando, SinAnioActivo } from "@/features/periodos/components/estados";

export const metadata: Metadata = { title: "Rectoría" };

export default function RectoriaPage() {
  return (
    <>
      <div className="border-b border-line bg-surface px-4 py-4 lg:px-6">
        <p className="text-xs text-muted">Rectoría</p>
        <h1 className="text-base font-semibold tracking-tight">Resultados de la institución, curso por curso</h1>
      </div>
      <Suspense fallback={<Cargando />}>
        <Panel />
      </Suspense>
    </>
  );
}

async function Panel() {
  const session = await requireSession(ROLES_RECTORIA);
  const data = await getRectoria(session);
  if (!data) return <SinAnioActivo />;
  const escala = await withTenant(session, (tx) => leerEscala(tx, session.institutionId));
  const d = data.decimales;
  const fmt = (n: number | null) => (n === null ? "—" : n.toFixed(d));
  const bajo = (n: number | null) => n !== null && n < data.aprobatoria;

  return (
    <div className="max-w-6xl space-y-5 px-4 py-5 lg:px-6">
      {session.rol === "RECTOR" && (
        <p className="flex items-center gap-2 rounded-sm border border-line bg-surface px-4 py-2 text-xs text-ink-soft">
          <IconLock className="size-3.5" /> Consulta académica de solo lectura. Puede registrar anotaciones en{" "}
          <Link href="/convivencia" className="font-medium text-brand hover:underline">
            Convivencia
          </Link>
          .
        </p>
      )}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line md:grid-cols-4">
        <Dato titulo={`Promedio acumulado ${data.anio}`} valor={fmt(data.institucion.acumulado)} alerta={bajo(data.institucion.acumulado)} />
        <Dato titulo="Estudiantes matriculados" valor={data.institucion.estudiantes.toLocaleString("es-CO")} />
        <Dato titulo="3+ asignaturas en bajo" valor={String(data.institucion.enRiesgo)} alerta={data.institucion.enRiesgo > 0} />
        <Dato titulo="Procesos disciplinarios abiertos" valor={String(data.institucion.procesosAbiertos)} />
      </dl>

      <section aria-labelledby="grafico" className="rounded-sm border border-line bg-surface px-4 py-3">
        <h2 id="grafico" className="font-semibold tracking-tight">Promedio acumulado por grado</h2>
        <p className="mb-2 text-xs text-muted">
          Escala {escala.min.toFixed(d)}–{escala.max.toFixed(d)}. En rojo los grados por debajo de la nota aprobatoria. El detalle de cada salón está en la tabla.
        </p>
        <PromediosCursos cursos={data.grados.map((g) => ({ id: String(g.codigo), codigo: g.nombre, acumulado: g.acumulado, estudiantes: g.estudiantes }))} min={escala.min} max={escala.max} aprobatoria={data.aprobatoria} decimales={d} />
      </section>

      <section aria-labelledby="tabla" className="overflow-x-auto rounded-sm border border-line bg-surface">
        <h2 id="tabla" className="border-b border-line px-4 py-2 font-semibold tracking-tight">
          Curso por curso
        </h2>
        <table className="w-full text-left">
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className="px-4 py-1.5 font-medium">Curso</th>
              <th scope="col" className="px-2 py-1.5 font-medium">Director</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Estudiantes</th>
              {data.periodos.map((p) => (
                <th key={p.id} scope="col" className="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                  {p.nombre}
                  {!p.cerrado && <span className="font-normal"> (parcial)</span>}
                </th>
              ))}
              <th scope="col" className="px-2 py-1.5 text-right font-medium">Acumulado</th>
              <th scope="col" className="px-2 py-1.5 text-right font-medium">En riesgo</th>
              <th scope="col" className="px-4 py-1.5 text-right font-medium">Anotaciones</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.cursos.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="px-4 py-1.5 font-medium">
                  {c.codigo} <span className="font-normal text-muted">· {c.grado}</span>
                </td>
                <td className="px-2 py-1.5 text-ink-soft">{c.director ?? "—"}</td>
                <td className="px-2 py-1.5 text-right">{c.estudiantes}</td>
                {data.periodos.map((p) => (
                  <td key={p.id} className={`px-2 py-1.5 text-right ${bajo(c.porPeriodo[p.id]) ? "font-medium text-bad" : ""}`}>
                    {fmt(c.porPeriodo[p.id])}
                  </td>
                ))}
                <td className={`px-2 py-1.5 text-right font-semibold ${bajo(c.acumulado) ? "text-bad" : ""}`}>{fmt(c.acumulado)}</td>
                <td className={`px-2 py-1.5 text-right ${c.enRiesgo ? "font-medium text-bad" : "text-muted"}`}>{c.enRiesgo}</td>
                <td className="px-4 py-1.5 text-right">
                  <Link href={`/convivencia?grupo=${c.id}`} className="hover:underline">
                    {c.anotaciones}
                    {c.procesosAbiertos > 0 && <span className="text-warn"> · {c.procesosAbiertos} abiertos</span>}
                  </Link>
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-line-strong bg-canvas font-medium">
              <td className="px-4 py-1.5" colSpan={2}>
                Institución
              </td>
              <td className="px-2 py-1.5 text-right">{data.institucion.estudiantes}</td>
              {data.periodos.map((p) => (
                <td key={p.id} className="px-2 py-1.5 text-right">
                  {fmt(data.institucion.porPeriodo[p.id])}
                </td>
              ))}
              <td className="px-2 py-1.5 text-right font-semibold">{fmt(data.institucion.acumulado)}</td>
              <td className="px-2 py-1.5 text-right">{data.institucion.enRiesgo}</td>
              <td className="px-4 py-1.5 text-right">{data.institucion.procesosAbiertos} abiertos</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Dato({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-xs text-muted">{titulo}</dt>
      <dd className={`mt-0.5 text-xl font-semibold ${alerta ? "text-bad" : ""}`}>{valor}</dd>
    </div>
  );
}
