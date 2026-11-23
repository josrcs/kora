import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SelectorGrupo } from "@/components/selector-grupo";
import { IconLock } from "@/components/icons";
import { requireSession } from "@/lib/auth/session";
import { formatNota } from "@/lib/grading/calc";
import { getPlanillaConvivencia } from "@/features/convivencia/server/notas";
import { TablaNotasConvivencia } from "@/features/convivencia/components/notas-convivencia";
import { Cargando, SinAnioActivo } from "@/features/periodos/components/estados";

export const metadata: Metadata = { title: "Nota de convivencia" };

export default function NotasConvivenciaPage({ searchParams }: PageProps<"/convivencia/notas">) {
  return (
    <>
      <div className="border-b border-line bg-surface px-4 py-4 lg:px-6">
        <p className="text-xs text-muted">Convivencia escolar · Ley 1620 de 2013</p>
        <h1 className="text-lg font-bold">Nota de convivencia</h1>
        <p className="mt-0.5 text-xs text-muted">
          Una nota por estudiante y periodo, en la misma escala del colegio. Se publica en el portal y en el boletín cuando se cierra el periodo.
        </p>
      </div>
      <Suspense fallback={<Cargando />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Contenido({ searchParams }: Pick<PageProps<"/convivencia/notas">, "searchParams">) {
  const session = await requireSession(["COORDINATOR", "TEACHER", "RECTOR"]);
  const params = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const data = await getPlanillaConvivencia(session, uno(params.grupo), uno(params.periodo));
  if (!data) return <SinAnioActivo />;
  if (data.grupos.length === 0) {
    return (
      <p className="m-6 max-w-xl rounded-2xl border border-line bg-surface px-4 py-3 text-ink-soft">
        No es director de ningún grupo este año. La nota de convivencia la registra el director de grupo o coordinación.
      </p>
    );
  }
  const { grupo, periodo, escala } = data;
  const href = (c: { grupo?: string | null; periodo?: string }) => {
    const q = new URLSearchParams();
    const g = c.grupo === undefined ? grupo?.id : c.grupo;
    if (g) q.set("grupo", g);
    const p = c.periodo ?? periodo?.id;
    if (p) q.set("periodo", p);
    return `/convivencia/notas?${q}`;
  };
  const conNota = data.filas.filter((f) => f.nota !== null);
  const promedio = conNota.length ? conNota.reduce((s, f) => s + (f.nota ?? 0), 0) / conNota.length : null;
  const enBajo = conNota.filter((f) => (f.nota ?? 0) < escala.aprobatoria).length;

  return (
    <div className="max-w-6xl space-y-4 px-4 py-5 lg:px-6">
      <SelectorGrupo grupos={data.grupos} actualId={grupo?.id ?? null} href={(id) => href({ grupo: id })} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Periodo" className="flex flex-wrap gap-1.5">
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
            </Link>
          ))}
        </nav>
        {grupo?.director && <p className="text-xs text-muted">Director de grupo: {grupo.director}</p>}
      </div>

      <div className="anim-escalonado grid gap-3 sm:grid-cols-3">
        {[
          ["Con nota", `${conNota.length} de ${data.filas.length}`, "text-ink"],
          ["Promedio del grupo", promedio === null ? "—" : formatNota(Math.round(promedio * 10) / 10, 1), "text-brand"],
          ["En desempeño bajo", String(enBajo), enBajo ? "text-bad" : "text-ok"],
        ].map(([t, v, c]) => (
          <div key={t} className="tarjeta-viva rounded-2xl border border-line bg-surface px-4 py-3 shadow-tarjeta">
            <p className="text-xs text-muted">{t}</p>
            <p className={`font-display text-2xl font-bold ${c}`}>{v}</p>
          </div>
        ))}
      </div>

      {data.motivoLectura && (
        <p className="flex items-center gap-2 rounded-xl border border-line-strong bg-canvas px-4 py-2.5 text-xs text-ink-soft">
          <IconLock className="size-3.5" /> {data.motivoLectura}
        </p>
      )}

      {periodo && <TablaNotasConvivencia filas={data.filas} periodId={periodo.id} escala={escala} editable={data.editable} />}
    </div>
  );
}
