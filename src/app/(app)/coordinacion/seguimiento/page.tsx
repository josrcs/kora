import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { IconLock } from "@/components/icons";
import { requireSession, ROLES_COORDINACION } from "@/lib/auth/session";
import { diasEntre, fechaCorta, hoyISO, porcentajeAvance, relativoDias } from "@/lib/fechas";
import { fechaHora } from "@/features/portal/formato";
import { getSeguimiento, type AvanceDocente } from "@/features/periodos/server/seguimiento";
import { BarraAvance } from "@/features/periodos/components/barra-avance";
import { EstadoChip } from "@/features/periodos/components/estado-chip";
import { Cargando, SinAnioActivo } from "@/features/periodos/components/estados";

export const metadata: Metadata = { title: "Seguimiento de notas" };

export default function SeguimientoPage({ searchParams }: PageProps<"/coordinacion/seguimiento">) {
  return (
    <Suspense fallback={<Cargando />}>
      <Seguimiento searchParams={searchParams} />
    </Suspense>
  );
}

async function Seguimiento({ searchParams }: Pick<PageProps<"/coordinacion/seguimiento">, "searchParams">) {
  const session = await requireSession(ROLES_COORDINACION);
  const params = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const data = await getSeguimiento(session, uno(params.periodo));
  if (!data) return <SinAnioActivo />;

  const { periodo, docentes } = data;
  const todos = uno(params.ver) === "todos";
  const href = (c: { periodo?: string; todos?: boolean }) => {
    const q = new URLSearchParams({ periodo: c.periodo ?? periodo.id });
    if (c.todos ?? todos) q.set("ver", "todos");
    return `/coordinacion/seguimiento?${q}`;
  };

  const hoy = hoyISO();
  const total = docentes.reduce((s, d) => ({ est: s.est + d.estudiantes, con: s.con + d.conNota }), { est: 0, con: 0 });
  const alDia = docentes.filter((d) => d.estado === "al-dia").length;
  const sinEmpezar = docentes.filter((d) => d.estado === "sin-empezar").length;
  const conPendientes = docentes.filter((d) => d.pendientes > 0);
  const visibles = todos ? docentes : conPendientes;
  const diasPlazo = periodo.fechaLimiteNotas ? diasEntre(hoy, periodo.fechaLimiteNotas) : null;

  return (
    <div className="max-w-5xl space-y-4 px-4 py-5 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Periodo" className="flex h-8 rounded-sm border border-line-strong bg-surface">
          {data.periodos.map((p, i) => (
            <Link
              key={p.id}
              href={href({ periodo: p.id })}
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
        {periodo.fechaLimiteNotas && (
          <p className={`text-xs ${!periodo.cerrado && diasPlazo !== null && diasPlazo < 0 ? "font-medium text-bad" : "text-muted"}`}>
            Plazo de entrega: {fechaCorta(periodo.fechaLimiteNotas, true)}
            {!periodo.cerrado && diasPlazo !== null && ` · ${diasPlazo < 0 ? "venció " : ""}${relativoDias(diasPlazo)}`}
            {periodo.cerrado && " · periodo cerrado"}
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line sm:grid-cols-4">
        <Dato titulo="Digitado" valor={`${porcentajeAvance(total.con, total.est)} %`} detalle={`${total.con.toLocaleString("es-CO")} de ${total.est.toLocaleString("es-CO")} calificaciones`} />
        <Dato titulo="Docentes al día" valor={`${alDia} de ${docentes.length}`} />
        <Dato titulo="Con pendientes" valor={String(conPendientes.length)} tono={conPendientes.length ? "warn" : undefined} />
        <Dato titulo="Sin empezar" valor={String(sinEmpezar)} tono={sinEmpezar ? "bad" : undefined} />
      </dl>

      <div className="flex items-center justify-between gap-3">
        <h1 className="font-semibold tracking-tight">
          {todos ? "Todos los docentes" : "Docentes con calificaciones pendientes"} · {periodo.nombre}
        </h1>
        <Link href={href({ todos: !todos })} className="text-xs font-medium text-brand hover:underline">
          {todos ? "Solo con pendientes" : `Ver todos (${docentes.length})`}
        </Link>
      </div>

      {visibles.length === 0 ? (
        <p className="rounded-sm border border-ok-line bg-ok-soft px-4 py-3 text-ok">
          {docentes.length === 0
            ? "No hay carga académica asignada en el año lectivo activo."
            : `Todos los docentes tienen las calificaciones de ${periodo.nombre.toLowerCase()} completas.`}
        </p>
      ) : (
        <div className="space-y-3">
          {visibles.map((d) => (
            <TarjetaDocente key={d.teacherId} docente={d} periodoId={periodo.id} todas={todos} />
          ))}
        </div>
      )}
    </div>
  );
}

function Dato({ titulo, valor, detalle, tono }: { titulo: string; valor: string; detalle?: string; tono?: "warn" | "bad" }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-xs text-muted">{titulo}</dt>
      <dd className={`mt-0.5 text-lg font-semibold tabular-nums ${tono === "bad" ? "text-bad" : tono === "warn" ? "text-warn" : ""}`}>{valor}</dd>
      {detalle && <dd className="text-xs text-muted tabular-nums">{detalle}</dd>}
    </div>
  );
}

function TarjetaDocente({ docente: d, periodoId, todas }: { docente: AvanceDocente; periodoId: string; todas: boolean }) {
  // Con colegios grandes, por defecto solo los cursos con pendientes (los demás se resumen en una línea).
  const visibles = todas ? d.asignaciones : d.asignaciones.filter((a) => a.pendientes > 0);
  const ocultas = d.asignaciones.length - visibles.length;
  return (
    <section aria-label={d.docente} className="rounded-sm border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2.5">
        <div className="min-w-48 flex-1">
          <p className="font-medium">{d.docente}</p>
          <p className="text-xs text-muted">
            {d.ultimaEdicion ? `Última edición: ${fechaHora(d.ultimaEdicion)}` : "Sin calificaciones registradas en el periodo"}
          </p>
        </div>
        <div className="w-44">
          <BarraAvance hecho={d.conNota} total={d.estudiantes} />
          <p className="mt-1 text-xs text-muted tabular-nums">
            {d.conNota} / {d.estudiantes}
            {d.pendientes > 0 && <span className="font-medium text-warn"> · faltan {d.pendientes}</span>}
          </p>
        </div>
        <EstadoChip estado={d.estado} />
      </div>
      <table className="w-full text-left">
        <caption className="sr-only">Asignaciones de {d.docente}</caption>
        <thead className="text-xs text-muted">
          <tr>
            <th scope="col" className="px-4 py-1.5 font-medium">Grupo</th>
            <th scope="col" className="px-2 py-1.5 font-medium">Asignatura</th>
            <th scope="col" className="px-2 py-1.5 text-right font-medium">Digitadas</th>
            <th scope="col" className="hidden px-2 py-1.5 font-medium sm:table-cell">Estado</th>
            <th scope="col" className="px-4 py-1.5"><span className="sr-only">Planilla</span></th>
          </tr>
        </thead>
        <tbody>
          {visibles.map((a) => (
            <tr key={a.assignmentId} className="border-t border-line">
              <td className="px-4 py-1.5 tabular-nums">{a.grupo}</td>
              <td className="px-2 py-1.5">{a.asignatura}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">
                <span className={a.pendientes > 0 ? "font-medium text-warn" : ""}>{a.conNota}</span>
                <span className="text-muted"> / {a.estudiantes}</span>
              </td>
              <td className="hidden px-2 py-1.5 sm:table-cell">
                <EstadoChip estado={a.estado} />
              </td>
              <td className="px-4 py-1.5 text-right">
                <Link
                  href={`/docente/planilla?asignacion=${a.assignmentId}&periodo=${periodoId}`}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Ver planilla
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {ocultas > 0 && <p className="border-t border-line px-4 py-1.5 text-xs text-muted">{ocultas} curso{ocultas === 1 ? "" : "s"} más al día.</p>}
    </section>
  );
}
