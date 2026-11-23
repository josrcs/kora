import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { IconLock } from "@/components/icons";
import { SelectorGrupo } from "@/components/selector-grupo";
import { requireSession, ROLES_COORDINACION } from "@/lib/auth/session";
import { fechaCorta } from "@/lib/fechas";
import { fechaHora } from "@/features/portal/formato";
import { getCorte } from "@/features/corte/server/corte";
import { GenerarCorte } from "@/features/corte/components/generar-corte";
import { Cargando, SinAnioActivo } from "@/features/periodos/components/estados";

export const metadata: Metadata = { title: "Corte preventivo" };

export default function CortePage({ searchParams }: PageProps<"/coordinacion/corte">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Corte searchParams={searchParams} />
    </Suspense>
  );
}

async function Corte({ searchParams }: Pick<PageProps<"/coordinacion/corte">, "searchParams">) {
  const session = await requireSession(ROLES_COORDINACION);
  const params = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const data = await getCorte(session, uno(params.periodo), uno(params.grupo));
  if (!data) return <SinAnioActivo />;
  const { periodo, corte } = data;
  const href = (c: { periodo?: string; grupo?: string | null }) => {
    const q = new URLSearchParams({ periodo: c.periodo ?? periodo.id });
    const g = c.grupo === undefined ? data.grupo?.id : c.grupo;
    if (g) q.set("grupo", g);
    return `/coordinacion/corte?${q}`;
  };
  const total = data.grupos.reduce((s, g) => ({ e: s.e + g.estudiantes, b: s.b + g.conBajas, r: s.r + g.enRiesgo }), { e: 0, b: 0, r: 0 });
  const porGrado = [...new Map(data.grupos.map((g) => [g.gradoCodigo, g.grado])).entries()].map(([codigo, grado]) => {
    const gs = data.grupos.filter((g) => g.gradoCodigo === codigo);
    return { codigo, grado, estudiantes: gs.reduce((s, g) => s + g.estudiantes, 0), conBajas: gs.reduce((s, g) => s + g.conBajas, 0), enRiesgo: gs.reduce((s, g) => s + g.enRiesgo, 0), primero: gs[0].id };
  });

  return (
    <div className="max-w-6xl space-y-4 px-4 py-5 lg:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-line bg-surface px-5 py-4 shadow-sm">
        <div>
          <p className="text-xs font-semibold tracking-wide text-petroleo uppercase">Corte preventivo · mitad de periodo</p>
          <h1 className="mt-1 text-lg font-semibold tracking-tight">{periodo.nombre}</h1>
          <p className="mt-1 text-xs text-muted">
            {periodo.fechaCorte && <>Fecha de corte: {fechaCorta(periodo.fechaCorte, true)} · </>}
            {corte ? (
              <>
                Generado el {fechaHora(corte.realizadoAt)} por {corte.realizadoPor}. Los estudiantes y acudientes ya ven su informe preventivo.
              </>
            ) : (
              "Aún no se ha generado. Toma una foto de las notas parciales de cada estudiante en cada asignatura."
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <nav aria-label="Periodo" className="flex rounded-xl border border-line bg-canvas p-1">
            {data.periodos.map((p) => (
              <Link
                key={p.id}
                href={href({ periodo: p.id, grupo: null })}
                aria-current={p.id === periodo.id ? "page" : undefined}
                className={`flex items-center gap-1 rounded-lg px-3 py-1 text-sm font-semibold ${p.id === periodo.id ? "bg-petroleo text-white" : "text-ink-soft hover:bg-surface"}`}
              >
                P{p.numero}
                {p.cerrado && <IconLock className="size-3" />}
              </Link>
            ))}
          </nav>
          {!periodo.cerrado && <GenerarCorte periodId={periodo.id} rehacer={corte !== null} />}
        </div>
      </div>

      {corte && (
        <>
          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line shadow-sm">
            <Dato titulo="Estudiantes" valor={total.e.toLocaleString("es-CO")} />
            <Dato titulo="Con al menos una asignatura en bajo" valor={`${total.b.toLocaleString("es-CO")} (${total.e ? Math.round((total.b / total.e) * 100) : 0} %)`} tono="warn" />
            <Dato titulo="Con 3 o más asignaturas en bajo" valor={total.r.toLocaleString("es-CO")} tono="bad" />
          </dl>

          <section className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm">
            <h2 className="border-b border-line px-5 py-3 font-semibold tracking-tight">Por grado</h2>
            <table className="w-full text-left">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="px-5 py-2 font-medium">Grado</th>
                  <th className="px-2 py-2 text-right font-medium">Estudiantes</th>
                  <th className="px-2 py-2 text-right font-medium">Con bajas</th>
                  <th className="px-2 py-2 font-medium"><span className="sr-only">Proporción</span></th>
                  <th className="px-5 py-2 text-right font-medium">3+ en bajo</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {porGrado.map((g) => {
                  const pct = g.estudiantes ? Math.round((g.conBajas / g.estudiantes) * 100) : 0;
                  return (
                    <tr key={g.codigo} className="border-t border-line hover:bg-canvas">
                      <td className="px-5 py-1.5 font-medium">
                        <Link href={href({ grupo: g.primero })} className="hover:underline">
                          {g.grado}
                        </Link>
                      </td>
                      <td className="px-2 py-1.5 text-right">{g.estudiantes}</td>
                      <td className="px-2 py-1.5 text-right">{g.conBajas}</td>
                      <td className="w-1/3 px-2 py-1.5">
                        <div className="h-2 rounded-full bg-slate-100" aria-hidden>
                          <div className="h-2 rounded-r-full bg-warn" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                      <td className={`px-5 py-1.5 text-right ${g.enRiesgo ? "font-semibold text-bad" : "text-muted"}`}>{g.enRiesgo}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <SelectorGrupo
            grupos={data.grupos.map((g) => ({ ...g, detalle: g.enRiesgo ? `· ${g.enRiesgo}` : undefined, alerta: g.enRiesgo > 0 }))}
            actualId={data.grupo?.id ?? null}
            href={(id) => href({ grupo: id })}
          />

          {data.grupo && (
            <section className="rounded-2xl border border-line bg-surface shadow-sm">
              <h2 className="border-b border-line px-5 py-3 font-semibold tracking-tight">
                {data.grupo.codigo} · {data.grupo.conBajas} de {data.grupo.estudiantes} estudiantes con asignaturas en bajo
              </h2>
              {data.estudiantes.length === 0 ? (
                <p className="px-5 py-4 text-ok">Ningún estudiante de {data.grupo.codigo} tiene asignaturas en bajo en el corte.</p>
              ) : (
                <ul>
                  {data.estudiantes.map((e) => (
                    <li key={e.studentId} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-line px-5 py-2 first:border-t-0">
                      <span className="w-64 font-medium">{e.nombre}</span>
                      <span className={`w-16 text-xs font-semibold ${e.bajas.length >= 3 ? "text-bad" : "text-warn"}`}>{e.bajas.length} en bajo</span>
                      <span className="flex flex-1 flex-wrap gap-1.5">
                        {e.bajas.map((b) => (
                          <span key={b.asignatura} className="rounded-lg border border-bad-line bg-bad-soft px-2 py-0.5 text-xs text-bad">
                            {b.asignatura} <span className="font-mono font-semibold">{b.nota === null ? "—" : b.nota.toFixed(data.decimales)}</span>
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Dato({ titulo, valor, tono }: { titulo: string; valor: string; tono?: "warn" | "bad" }) {
  return (
    <div className="bg-surface px-5 py-4">
      <dt className="text-xs text-muted">{titulo}</dt>
      <dd className={`mt-1 text-2xl font-semibold ${tono === "bad" ? "text-bad" : tono === "warn" ? "text-warn" : "text-ink"}`}>{valor}</dd>
    </div>
  );
}
