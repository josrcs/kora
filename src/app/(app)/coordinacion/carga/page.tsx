import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SelectorGrupo } from "@/components/selector-grupo";
import { requireSession, ROLES_COORDINACION } from "@/lib/auth/session";
import { getCargaAcademica } from "@/features/carga-academica/server/queries";
import { DirectorForm, FilaAsignacion } from "@/features/carga-academica/components/fila-asignacion";
import type { CargaAcademica } from "@/features/carga-academica/types";
import { Cargando, SinAnioActivo } from "@/features/periodos/components/estados";

export const metadata: Metadata = { title: "Carga académica" };

export default function CargaPage({ searchParams }: PageProps<"/coordinacion/carga">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Carga searchParams={searchParams} />
    </Suspense>
  );
}

async function Carga({ searchParams }: Pick<PageProps<"/coordinacion/carga">, "searchParams">) {
  const session = await requireSession(ROLES_COORDINACION);
  const params = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const data = await getCargaAcademica(session, uno(params.grupo));
  if (!data) return <SinAnioActivo />;
  const porDocente = uno(params.vista) === "docentes";

  return (
    <div className="max-w-5xl space-y-4 px-4 py-5 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-semibold tracking-tight">Carga académica {data.anio}</h1>
        <nav aria-label="Vista" className="flex h-8 rounded-sm border border-line-strong bg-surface">
          {[
            { id: false, texto: "Por grupo" },
            { id: true, texto: "Por docente" },
          ].map((v, i) => (
            <Link
              key={v.texto}
              href={v.id ? "/coordinacion/carga?vista=docentes" : `/coordinacion/carga${data.grupo ? `?grupo=${data.grupo.id}` : ""}`}
              aria-current={porDocente === v.id ? "page" : undefined}
              className={`flex items-center px-3 ${i > 0 ? "border-l border-line-strong" : ""} ${
                porDocente === v.id ? "bg-brand font-medium text-white" : "text-ink-soft hover:bg-slate-50"
              }`}
            >
              {v.texto}
            </Link>
          ))}
        </nav>
      </div>
      {porDocente ? <PorDocente data={data} /> : <PorGrupo data={data} />}
    </div>
  );
}

function PorGrupo({ data }: { data: CargaAcademica }) {
  const { grupo } = data;
  if (!grupo) {
    return <p className="rounded-sm border border-line bg-surface p-4 text-muted">No hay grupos creados en el año lectivo activo.</p>;
  }
  const sinDocente = data.filas.filter((f) => !f.assignmentId).length;
  const horas = data.filas.reduce((s, f) => s + (f.intensidadHoraria ?? 0), 0);

  return (
    <>
      <SelectorGrupo
        grupos={data.grupos.map((g) => ({
          ...g,
          alerta: g.asignadas < data.totalAsignaturas,
          detalle: g.asignadas < data.totalAsignaturas ? `· ${data.totalAsignaturas - g.asignadas} sin docente` : undefined,
        }))}
        actualId={grupo.id}
        href={(id) => `/coordinacion/carga${id ? `?grupo=${id}` : ""}`}
      />

      <section aria-label={`Grupo ${grupo.codigo}`} className="rounded-sm border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="font-semibold tracking-tight">
              Grupo {grupo.codigo} <span className="font-normal text-muted">· {grupo.grado} · {grupo.estudiantes} estudiantes</span>
            </h2>
            <p className="text-xs text-muted tabular-nums">
              {horas} horas semanales
              {sinDocente > 0 && <span className="font-medium text-warn"> · {sinDocente} asignaturas sin docente</span>}
            </p>
          </div>
          <DirectorForm groupId={grupo.id} directorId={grupo.directorId} docentes={data.docentes} />
        </div>
        <table className="w-full text-left">
          <caption className="sr-only">Asignaturas y docentes del grupo {grupo.codigo}</caption>
          <thead className="text-xs text-muted max-sm:hidden">
            <tr>
              <th scope="col" className="px-4 py-1.5 font-medium">Asignatura</th>
              <th scope="col" className="px-2 py-1.5 font-medium" colSpan={3}>Docente e intensidad horaria</th>
              <th scope="col" className="px-4 py-1.5"><span className="sr-only">Quitar</span></th>
            </tr>
          </thead>
          <tbody>
            {data.filas.map((f) => (
              <FilaAsignacion key={f.subjectId} fila={f} groupId={grupo.id} docentes={data.docentes} />
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function PorDocente({ data }: { data: CargaAcademica }) {
  return (
    <div className="overflow-x-auto rounded-sm border border-line bg-surface">
      <table className="w-full text-left">
        <caption className="sr-only">Carga académica por docente</caption>
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">Docente</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Horas/sem</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">Asignaciones</th>
            <th scope="col" className="px-2 py-2 font-medium">Grupos</th>
            <th scope="col" className="px-4 py-2 font-medium">Director de</th>
          </tr>
        </thead>
        <tbody>
          {data.resumen.map((d) => (
            <tr key={d.id} className="border-t border-line">
              <td className="px-4 py-2 font-medium">{d.nombre}</td>
              <td className="px-2 py-2 text-right tabular-nums">{d.horas || <span className="text-muted">—</span>}</td>
              <td className="px-2 py-2 text-right tabular-nums">{d.asignaciones || <span className="text-muted">—</span>}</td>
              <td className="px-2 py-2 tabular-nums">
                {d.grupos.length ? d.grupos.join(", ") : <span className="text-warn">Sin carga asignada</span>}
              </td>
              <td className="px-4 py-2 tabular-nums">{d.esDirectorDe.join(", ") || <span className="text-muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
