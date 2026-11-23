import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { withTenant } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { IconLock } from "@/components/icons";
import { estudiantesDelPortal } from "@/features/portal/server/acceso";
import { getAsistencia, getBoletin, getConvivenciaPortal, getInformePreventivo, getObservador } from "@/features/portal/server/consultas";
import { ConvivenciaPortal } from "@/features/portal/components/convivencia-portal";
import { AvisosDestacados } from "@/features/avisos/components/avisos-destacados";
import { DesempenoBadge } from "@/components/desempeno-badge";
import { fechaHora } from "@/features/portal/formato";
import { BoletinDocumento } from "@/features/portal/components/boletin-documento";
import { AsistenciaTabla } from "@/features/portal/components/asistencia-tabla";
import { ObservadorLista } from "@/features/portal/components/observador-lista";

export const metadata: Metadata = { title: "Portal académico" };

const VISTAS = [
  { id: "boletin", texto: "Boletín" },
  { id: "preventivo", texto: "Informe preventivo" },
  { id: "convivencia", texto: "Convivencia" },
  { id: "asistencia", texto: "Asistencia" },
  { id: "observador", texto: "Observador" },
] as const;
type Vista = (typeof VISTAS)[number]["id"];

export default function PortalPage({ searchParams }: PageProps<"/portal">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Portal searchParams={searchParams} />
    </Suspense>
  );
}

async function Portal({ searchParams }: Pick<PageProps<"/portal">, "searchParams">) {
  const session = await requireSession(["STUDENT", "GUARDIAN"]);
  const params = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const estudiantes = await withTenant(session, (tx) => estudiantesDelPortal(tx, session));
  if (estudiantes.length === 0) {
    return (
      <div className="m-6 max-w-xl rounded-sm border border-line bg-surface p-4">
        <p className="font-medium">No hay estudiantes vinculados a su cuenta.</p>
        <p className="mt-1 text-muted">Comuníquese con la secretaría de la institución para registrar el vínculo.</p>
      </div>
    );
  }

  const estudiante = estudiantes.find((e) => e.id === uno(params.estudiante)) ?? estudiantes[0];
  const vista: Vista = VISTAS.some((v) => v.id === uno(params.vista)) ? (uno(params.vista) as Vista) : "boletin";
  const periodoId = uno(params.periodo);
  const href = (cambios: { estudiante?: string; vista?: Vista; periodo?: string }) => {
    const q = new URLSearchParams();
    q.set("estudiante", cambios.estudiante ?? estudiante.id);
    const v = cambios.vista ?? vista;
    if (v !== "boletin") q.set("vista", v);
    const p = cambios.periodo ?? (cambios.estudiante ? undefined : periodoId);
    if (p && v === "boletin") q.set("periodo", p);
    return `/portal?${q}`;
  };

  return (
    <>
      <div className="border-b border-line bg-surface px-4 pt-4 lg:px-6">
        <p className="text-xs text-muted">Portal académico</p>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="text-xl font-bold">{estudiante.nombre}</h1>
          {estudiante.grupo && <span className="text-muted">Grupo {estudiante.grupo}</span>}
        </div>

        {estudiantes.length > 1 && (
          <nav aria-label="Estudiante" className="mt-3 flex flex-wrap gap-2">
            {estudiantes.map((e) => (
              <Link
                key={e.id}
                href={href({ estudiante: e.id })}
                aria-current={e.id === estudiante.id ? "true" : undefined}
                className={`rounded-sm border px-2.5 py-1 text-xs ${
                  e.id === estudiante.id ? "border-brand bg-brand-soft font-medium text-brand" : "border-line-strong text-ink-soft hover:bg-slate-50"
                }`}
              >
                {e.nombre}
                {e.grupo && <span className="ml-1 text-muted">· {e.grupo}</span>}
              </Link>
            ))}
          </nav>
        )}

        <nav aria-label="Secciones" className="mt-3 flex gap-5">
          {VISTAS.map((v) => (
            <Link
              key={v.id}
              href={href({ vista: v.id })}
              aria-current={v.id === vista ? "page" : undefined}
              className={`-mb-px border-b-2 pb-2.5 transition-colors ${
                v.id === vista ? "border-cielo font-semibold text-ink" : "border-transparent text-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              {v.texto}
            </Link>
          ))}
        </nav>
      </div>

      <div className="px-4 py-5 lg:px-6">
        <AvisosDestacados session={session} />
        {vista === "boletin" && <VistaBoletin session={session} estudianteId={estudiante.id} periodoId={periodoId} href={href} />}
        {vista === "preventivo" && <VistaPreventivo session={session} estudianteId={estudiante.id} />}
        {vista === "convivencia" && <VistaConvivencia session={session} estudianteId={estudiante.id} />}
        {vista === "asistencia" && <VistaAsistencia session={session} estudianteId={estudiante.id} />}
        {vista === "observador" && <VistaObservador session={session} estudianteId={estudiante.id} />}
      </div>
    </>
  );
}

type Session = Awaited<ReturnType<typeof requireSession>>;

async function VistaBoletin({
  session,
  estudianteId,
  periodoId,
  href,
}: {
  session: Session;
  estudianteId: string;
  periodoId: string | undefined;
  href: (c: { periodo?: string }) => string;
}) {
  const res = await getBoletin(session, estudianteId, periodoId);
  if (res.estado === "sin-acceso") return <p className="text-muted">No tiene acceso a la información de este estudiante.</p>;
  if (res.estado === "sin-publicar") {
    return (
      <p className="max-w-xl rounded-sm border border-line bg-surface px-4 py-3 text-ink-soft">
        Aún no hay boletines publicados este año.
        {res.periodoActual && ` El de ${res.periodoActual.nombre.toLowerCase()} estará disponible cuando coordinación cierre el periodo.`}
      </p>
    );
  }

  const { data, periodos } = res;
  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <nav aria-label="Periodo" className="flex h-8 rounded-sm border border-line-strong bg-surface">
          {periodos.map((p, i) => {
            const activo = p.id === data.periodo.id;
            const clase = `flex items-center gap-1.5 px-3 ${i > 0 ? "border-l border-line-strong" : ""}`;
            return p.cerrado ? (
              <Link
                key={p.id}
                href={href({ periodo: p.id })}
                aria-current={activo ? "page" : undefined}
                className={`${clase} ${activo ? "bg-brand font-medium text-white" : "text-ink-soft hover:bg-slate-50"}`}
              >
                {p.nombre}
              </Link>
            ) : (
              <span key={p.id} className={`${clase} cursor-not-allowed text-slate-400`} title="Se publica cuando coordinación cierre el periodo">
                <IconLock className="size-3" />
                {p.nombre} · en curso
              </span>
            );
          })}
        </nav>
        <a
          href={`/portal/pdf?estudiante=${estudianteId}&periodo=${data.periodo.id}`}
          download
          className="flex h-8 items-center rounded-sm bg-brand px-3 font-medium text-white hover:bg-brand-hover"
        >
          Descargar boletín (PDF)
        </a>
      </div>
      <BoletinDocumento data={data} />
    </div>
  );
}

async function VistaPreventivo({ session, estudianteId }: { session: Session; estudianteId: string }) {
  const r = await getInformePreventivo(session, estudianteId);
  if (r === null) return <p className="text-muted">No tiene acceso a la información de este estudiante.</p>;
  if (r === "sin-corte") {
    return <p className="max-w-xl rounded-sm border border-line bg-surface px-4 py-3 text-ink-soft">Coordinación aún no ha hecho el corte preventivo de este año.</p>;
  }
  const enBajo = r.filas.filter((f) => f.nota !== null && f.nota < r.aprobatoria);
  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <div className={`rounded-xl border px-4 py-3 ${enBajo.length ? "border-warn-line bg-warn-soft text-warn" : "border-ok-line bg-ok-soft text-ok"}`}>
        <p className="font-semibold">
          Corte preventivo de {r.periodo.nombre.toLowerCase()} ·{" "}
          {enBajo.length ? `${enBajo.length} asignatura${enBajo.length === 1 ? "" : "s"} en riesgo` : "sin asignaturas en riesgo"}
        </p>
        <p className="text-xs">
          Notas parciales a mitad de periodo (corte del {fechaHora(r.realizadoAt)}). No son definitivas: sirven para mejorar a tiempo.
        </p>
      </div>
      <table className="w-full overflow-hidden rounded-xl border border-line bg-surface text-left">
        <thead className="text-xs text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Asignatura</th>
            <th className="px-2 py-2 font-medium">Docente</th>
            <th className="px-2 py-2 text-right font-medium">Nota parcial</th>
            <th className="px-4 py-2 text-center font-medium">Desempeño</th>
          </tr>
        </thead>
        <tbody>
          {r.filas.map((f) => (
            <tr key={f.asignatura} className={`border-t border-line ${f.nota !== null && f.nota < r.aprobatoria ? "bg-bad-soft/40" : ""}`}>
              <td className="px-4 py-2 font-medium">{f.asignatura}</td>
              <td className="px-2 py-2 text-ink-soft">{f.docente}</td>
              <td className={`px-2 py-2 text-right font-mono font-semibold ${f.nota !== null && f.nota < r.aprobatoria ? "text-bad" : ""}`}>
                {f.nota === null ? "—" : f.nota.toFixed(r.decimales)}
              </td>
              <td className="px-4 py-2 text-center">
                <DesempenoBadge desempeno={f.desempeno ?? "PENDIENTE"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function VistaConvivencia({ session, estudianteId }: { session: Session; estudianteId: string }) {
  const r = await getConvivenciaPortal(session, estudianteId);
  return r ? <ConvivenciaPortal filas={r.filas} escala={r.escala} /> : <p className="text-muted">No tiene acceso a la información de este estudiante.</p>;
}

async function VistaAsistencia({ session, estudianteId }: { session: Session; estudianteId: string }) {
  const data = await getAsistencia(session, estudianteId);
  return data ? <AsistenciaTabla data={data} /> : <p className="text-muted">No tiene acceso a la información de este estudiante.</p>;
}

async function VistaObservador({ session, estudianteId }: { session: Session; estudianteId: string }) {
  const anotaciones = await getObservador(session, estudianteId);
  return anotaciones ? (
    <ObservadorLista anotaciones={anotaciones} esAcudiente={session.rol === "GUARDIAN"} />
  ) : (
    <p className="text-muted">No tiene acceso a la información de este estudiante.</p>
  );
}

function Cargando() {
  return (
    <div className="animate-pulse space-y-3 px-4 py-4 lg:px-6" aria-label="Cargando">
      <div className="h-6 w-72 rounded-sm bg-slate-200/70" />
      <div className="h-[60vh] max-w-5xl rounded-sm border border-line bg-surface" />
    </div>
  );
}
