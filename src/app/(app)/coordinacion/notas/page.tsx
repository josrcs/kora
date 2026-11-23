import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SelectorGrupo } from "@/components/selector-grupo";
import { IconLock } from "@/components/icons";
import { requireSession, ROLES_RECTORIA } from "@/lib/auth/session";
import { desempenoDe, formatNota, reprueba } from "@/lib/grading/calc";
import { getConsolidado } from "@/features/consolidado/server";
import { Cargando, SinAnioActivo } from "@/features/periodos/components/estados";

export const metadata: Metadata = { title: "Consolidado de notas" };

const COLOR_CELDA = {
  SUPERIOR: "bg-ok-soft text-ok",
  ALTO: "bg-cielo-soft text-brand",
  BASICO: "text-ink",
  BAJO: "bg-bad-soft text-bad font-bold",
} as const;

export default function ConsolidadoPage({ searchParams }: PageProps<"/coordinacion/notas">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Contenido searchParams={searchParams} />
    </Suspense>
  );
}

async function Contenido({ searchParams }: Pick<PageProps<"/coordinacion/notas">, "searchParams">) {
  const session = await requireSession(ROLES_RECTORIA);
  const params = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const data = await getConsolidado(session, uno(params.grupo), uno(params.periodo));
  if (!data) return <SinAnioActivo />;
  const { grupo, periodo, escala, asignaturas, estudiantes } = data;

  const href = (c: { grupo?: string | null; periodo?: string }) => {
    const q = new URLSearchParams();
    const g = c.grupo === undefined ? grupo?.id : c.grupo;
    if (g) q.set("grupo", g);
    const p = c.periodo ?? periodo?.id;
    if (p) q.set("periodo", p);
    return `/coordinacion/notas?${q}`;
  };

  const filas = estudiantes.map((e) => {
    const valores = asignaturas.map((a) => e.notas[a.asignacionId]).filter((n): n is number => n !== null && n !== undefined);
    const promedio = valores.length ? valores.reduce((s, n) => s + n, 0) / valores.length : null;
    const perdidas = valores.filter((n) => reprueba(n, escala)).length;
    return { ...e, promedio, perdidas };
  });
  const conPromedio = filas.filter((f) => f.promedio !== null);
  const promGrupo = conPromedio.length ? conPromedio.reduce((s, f) => s + (f.promedio ?? 0), 0) / conPromedio.length : null;
  const enRiesgo = filas.filter((f) => f.perdidas >= 3).length;
  const r1 = (n: number | null) => (n === null ? "—" : formatNota(Math.round(n * 10) / 10, 1));

  return (
    <div className="space-y-4 px-4 py-5 lg:px-6">
      <SelectorGrupo grupos={data.grupos} actualId={grupo?.id ?? null} href={(id) => href({ grupo: id })} />

      <div className="flex flex-wrap items-center gap-1.5">
        {data.periodos.map((p) => (
          <Link
            key={p.id}
            href={href({ periodo: p.id })}
            aria-current={p.id === periodo?.id ? "page" : undefined}
            className={`btn-kora flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              p.id === periodo?.id ? "border-petroleo bg-petroleo text-white" : "border-line-strong bg-surface text-ink-soft hover:border-cielo hover:text-brand"
            }`}
          >
            {p.cerrado && <IconLock className="size-3" />}
            {p.nombre}
            <span className="font-normal opacity-75">· {p.cerrado ? "cerrado" : "abierto"}</span>
          </Link>
        ))}
      </div>

      {periodo?.cerrado && (
        <p className="flex items-center gap-2 rounded-xl border border-cielo/30 bg-cielo-soft px-4 py-2.5 text-xs text-ink-soft">
          <IconLock className="size-3.5 text-brand" />
          {periodo.nombre} está cerrado: las notas son de solo lectura, pero coordinación y rectoría las siguen consultando completas.
        </p>
      )}

      <div className="anim-escalonado grid gap-3 sm:grid-cols-4">
        {[
          ["Estudiantes", String(estudiantes.length), "text-ink"],
          ["Promedio del salón", r1(promGrupo), "text-brand"],
          ["Asignaturas", String(asignaturas.length), "text-ink"],
          ["Con 3+ perdidas", String(enRiesgo), enRiesgo ? "text-bad" : "text-ok"],
        ].map(([t, v, c]) => (
          <div key={t} className="tarjeta-viva rounded-2xl border border-line bg-surface px-4 py-3 shadow-tarjeta">
            <p className="text-xs text-muted">{t}</p>
            <p className={`font-display text-2xl font-bold ${c}`}>{v}</p>
          </div>
        ))}
      </div>

      <div className="overflow-auto rounded-2xl border border-line bg-surface shadow-tarjeta" style={{ maxHeight: "70vh" }}>
        <table className="w-full border-separate border-spacing-0 text-left text-[12px]">
          <thead className="sticky top-0 z-10 bg-canvas text-[11px] text-muted">
            <tr>
              <th className="sticky left-0 z-20 border-b border-line bg-canvas px-3 py-2 font-medium">Estudiante</th>
              {asignaturas.map((a) => (
                <th key={a.asignacionId} title={`${a.nombre} · ${a.docente}`} className="border-b border-line px-2 py-2 text-center font-semibold whitespace-nowrap">
                  {a.abreviatura}
                </th>
              ))}
              <th className="border-b border-l border-line bg-brand-soft px-2 py-2 text-center font-semibold text-brand">Conv.</th>
              <th className="border-b border-line px-2 py-2 text-center font-semibold">Prom.</th>
              <th className="border-b border-line px-2 py-2 text-center font-semibold">Perd.</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((e) => (
              <tr key={e.enrollmentId} className="group">
                <td className="sticky left-0 z-[5] border-b border-line bg-surface px-3 py-1.5 whitespace-nowrap group-hover:bg-brand-soft">
                  <span className="font-medium text-ink">{e.nombre}</span>
                </td>
                {asignaturas.map((a) => {
                  const n = e.notas[a.asignacionId];
                  const d = desempenoDe(n, escala);
                  const rec = e.recuperadas.includes(a.asignacionId);
                  return (
                    <td
                      key={a.asignacionId}
                      title={rec ? "Nota con recuperación" : undefined}
                      className={`border-b border-line px-2 py-1.5 text-center font-mono group-hover:brightness-95 ${d ? COLOR_CELDA[d] : "text-muted"}`}
                    >
                      {n === null || n === undefined ? "—" : formatNota(n, escala.decimales)}
                      {rec && <sup className="ml-0.5 text-[9px] text-brand">R</sup>}
                    </td>
                  );
                })}
                <td className={`border-b border-l border-line px-2 py-1.5 text-center font-mono ${e.convivencia !== null && reprueba(e.convivencia, escala) ? "text-bad" : "text-brand"}`}>
                  {e.convivencia === null ? "—" : formatNota(e.convivencia, escala.decimales)}
                </td>
                <td className="border-b border-line px-2 py-1.5 text-center font-mono font-semibold">{r1(e.promedio)}</td>
                <td className={`border-b border-line px-2 py-1.5 text-center font-semibold ${e.perdidas >= 3 ? "text-bad" : e.perdidas ? "text-warn" : "text-muted"}`}>
                  {e.perdidas}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Nota final con recuperación (<sup className="text-brand">R</sup>). Pase el mouse por una asignatura para ver su nombre y docente.
      </p>
    </div>
  );
}
