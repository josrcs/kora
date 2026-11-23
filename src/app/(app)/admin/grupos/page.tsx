import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSession, ROLES_ADMINISTRACION } from "@/lib/auth/session";
import { getGrupos } from "@/features/admin/server/grupos";
import { NuevoGrupo, TablaGrupos } from "@/features/admin/components/grupos-admin";
import { Cargando } from "@/features/periodos/components/estados";

export const metadata: Metadata = { title: "Grupos" };

export default function GruposPage({ searchParams }: PageProps<"/admin/grupos">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Grupos searchParams={searchParams} />
    </Suspense>
  );
}

async function Grupos({ searchParams }: Pick<PageProps<"/admin/grupos">, "searchParams">) {
  const session = await requireSession(ROLES_ADMINISTRACION);
  const { anio: anioParam } = await searchParams;
  const data = await getGrupos(session, Array.isArray(anioParam) ? anioParam[0] : anioParam);

  if (!data.anio) {
    return (
      <div className="m-6 max-w-xl rounded-sm border border-line bg-surface p-4">
        <p className="font-medium">No hay años lectivos.</p>
        <p className="mt-1 text-muted">
          Cree uno en{" "}
          <Link href="/admin/anios" className="font-medium text-brand hover:underline">
            Años y periodos
          </Link>
          .
        </p>
      </div>
    );
  }

  const total = data.grupos.reduce((s, g) => s + g.matriculados, 0);
  return (
    <div className="max-w-5xl space-y-4 px-4 py-5 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Grupos {data.anio.anio}</h1>
          <p className="text-xs text-muted">
            {data.grupos.length} grupos · {total} estudiantes matriculados
            {!data.anio.activo && " · año inactivo: la carga académica y las matrículas se hacen cuando se active"}
          </p>
        </div>
        {data.anios.length > 1 && (
          <nav aria-label="Año lectivo" className="flex h-8 rounded-sm border border-line-strong bg-surface">
            {data.anios.map((a, i) => (
              <Link
                key={a.id}
                href={`/admin/grupos?anio=${a.id}`}
                aria-current={a.id === data.anio!.id ? "page" : undefined}
                className={`flex items-center px-3 ${i > 0 ? "border-l border-line-strong" : ""} ${
                  a.id === data.anio!.id ? "bg-brand font-medium text-white" : "text-ink-soft hover:bg-slate-50"
                }`}
              >
                {a.anio}
                {a.activo && <span className="ml-1 text-[11px] opacity-80">(activo)</span>}
              </Link>
            ))}
          </nav>
        )}
      </div>
      <NuevoGrupo data={data} />
      {data.grupos.length > 0 ? (
        <TablaGrupos grupos={data.grupos} />
      ) : (
        <p className="rounded-sm border border-line bg-surface p-4 text-muted">Este año todavía no tiene grupos.</p>
      )}
    </div>
  );
}
