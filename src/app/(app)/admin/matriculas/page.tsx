import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SelectorGrupo } from "@/components/selector-grupo";
import { requireSession, ROLES_ADMINISTRACION } from "@/lib/auth/session";
import { getMatriculas } from "@/features/admin/server/matriculas";
import { Desplegable, MatricularForm, TablaMatriculas } from "@/features/admin/components/matriculas-admin";
import { Cargando, SinAnioActivo } from "@/features/periodos/components/estados";

export const metadata: Metadata = { title: "Matrículas" };

export default function MatriculasPage({ searchParams }: PageProps<"/admin/matriculas">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Matriculas searchParams={searchParams} />
    </Suspense>
  );
}

async function Matriculas({ searchParams }: Pick<PageProps<"/admin/matriculas">, "searchParams">) {
  const session = await requireSession(ROLES_ADMINISTRACION);
  const { grupo: grupoParam } = await searchParams;
  const data = await getMatriculas(session, Array.isArray(grupoParam) ? grupoParam[0] : grupoParam);
  if (!data) return <SinAnioActivo />;
  const { grupo } = data;

  return (
    <div className="max-w-5xl space-y-4 px-4 py-5 lg:px-6">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Matrículas {data.anio.anio}</h1>
        <p className="text-xs text-muted">Año lectivo activo. Los grupos se crean en «Grupos».</p>
      </div>
      {!grupo ? (
        <p className="rounded-sm border border-line bg-surface p-4 text-muted">
          El año activo no tiene grupos.{" "}
          <Link href="/admin/grupos" className="font-medium text-brand hover:underline">
            Crear grupos
          </Link>
        </p>
      ) : (
        <>
          <SelectorGrupo
            grupos={data.grupos.map((g) => ({ ...g, detalle: `· ${g.matriculados}` }))}
            actualId={grupo.id}
            href={(id) => `/admin/matriculas${id ? `?grupo=${id}` : ""}`}
          />
          <h2 className="font-semibold tracking-tight">
            Grupo {grupo.codigo}{" "}
            <span className="font-normal text-muted">
              · {grupo.grado} · {grupo.matriculados}
              {grupo.capacidad !== null && ` / ${grupo.capacidad}`} estudiantes
            </span>
          </h2>
          <Desplegable titulo={`Matricular estudiante en ${grupo.codigo}`}>
            <MatricularForm grupo={grupo} />
          </Desplegable>
          <TablaMatriculas filas={data.filas} grupo={grupo} grupos={data.grupos} />
        </>
      )}
    </div>
  );
}
