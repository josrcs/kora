import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { IconLock } from "@/components/icons";
import { requireSession, ROLES_PLANILLA } from "@/lib/auth/session";
import { hoyISO } from "@/lib/fechas";
import { getCargaDocente } from "@/features/planilla/server/queries";
import { getListaAsistencia } from "@/features/asistencia/server";
import { ListaClase } from "@/features/asistencia/components/lista-clase";
import { SelectorClase } from "@/features/asistencia/components/selector-clase";
import { Cargando } from "@/features/periodos/components/estados";

export const metadata: Metadata = { title: "Asistencia" };

const fechaLarga = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fechaCorta = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });

export default function AsistenciaPage({ searchParams }: PageProps<"/docente/asistencia">) {
  return (
    <>
      <div className="border-b border-line bg-surface px-4 py-4 lg:px-6">
        <p className="text-xs text-muted">Calificaciones</p>
        <h1 className="text-lg font-bold">Asistencia diaria</h1>
        <p className="mt-0.5 text-xs text-muted">Pase lista en cada clase. Las fallas de la planilla se calculan solas a partir de esta lista.</p>
      </div>
      <Suspense fallback={<Cargando />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Contenido({ searchParams }: Pick<PageProps<"/docente/asistencia">, "searchParams">) {
  const session = await requireSession(ROLES_PLANILLA);
  const params = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

  const { asignaciones, periodos } = await getCargaDocente(session);
  if (asignaciones.length === 0) {
    return <p className="m-6 max-w-xl rounded-2xl border border-line bg-surface p-5 text-ink-soft">No tiene clases asignadas en el año lectivo activo.</p>;
  }
  const hoy = hoyISO();
  const pedida = uno(params.fecha);
  const fecha = pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) && pedida <= hoy ? pedida : hoy;
  const asignacion = asignaciones.find((a) => a.id === uno(params.asignacion)) ?? asignaciones[0];
  const lista = await getListaAsistencia(session, asignacion, periodos, fecha);

  return (
    <div className="grid items-start gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_18rem] lg:px-6">
      <div className="min-w-0 space-y-4">
        <SelectorClase asignaciones={asignaciones} actualId={asignacion.id} fecha={fecha} hoy={hoy} />
        <div>
          <h2 className="font-display text-base font-bold text-ink">
            {asignacion.grupo} · {asignacion.asignatura}
          </h2>
          <p className="text-xs text-muted first-letter:uppercase">
            {fechaLarga(fecha)}
            {lista.periodo && ` · ${lista.periodo.nombre}`}
            {lista.sesion ? " · lista ya registrada" : " · aún sin registrar"}
          </p>
        </div>
        {lista.motivoLectura && (
          <p className="flex items-center gap-2 rounded-xl border border-line-strong bg-canvas px-4 py-2.5 text-xs text-ink-soft">
            <IconLock className="size-3.5" /> {lista.motivoLectura}
          </p>
        )}
        {(lista.editable || lista.sesion) && (
          <ListaClase
            key={`${asignacion.id}-${fecha}-${lista.sesion?.id ?? "nueva"}`}
            assignmentId={asignacion.id}
            fecha={fecha}
            filas={lista.filas}
            horasIniciales={lista.sesion?.horas ?? 1}
            temaInicial={lista.sesion?.tema ?? ""}
            sesionId={lista.sesion?.id ?? null}
            editable={lista.editable}
            intensidadHoraria={asignacion.intensidadHoraria}
          />
        )}
      </div>

      <aside className="space-y-3 lg:sticky lg:top-20">
        <section className="rounded-2xl border border-line bg-surface p-4 shadow-tarjeta">
          <h2 className="font-bold">Clases del periodo</h2>
          <p className="text-xs text-muted">{lista.historial.length} registrada(s){lista.periodo ? ` en ${lista.periodo.nombre}` : ""}</p>
          {lista.historial.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Todavía no hay clases registradas.</p>
          ) : (
            <ul className="anim-escalonado mt-3 max-h-[28rem] space-y-1.5 overflow-y-auto">
              {lista.historial.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/docente/asistencia?asignacion=${asignacion.id}&fecha=${c.fecha}`}
                    aria-current={c.fecha === fecha ? "page" : undefined}
                    className={`block rounded-xl border px-3 py-2 transition-colors ${c.fecha === fecha ? "border-cielo bg-cielo-soft" : "border-line hover:border-line-strong"}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold text-ink capitalize">{fechaCorta(c.fecha)}</span>
                      <span className="text-[11px] text-muted">{c.horas} h</span>
                    </span>
                    <span className="mt-0.5 flex gap-2 text-[11px]">
                      <span className={c.ausentes ? "font-semibold text-bad" : "text-ok"}>{c.ausentes ? `${c.ausentes} ausente(s)` : "Sin ausencias"}</span>
                      {c.tardes > 0 && <span className="text-warn">{c.tardes} tarde</span>}
                      {c.excusas > 0 && <span className="text-brand">{c.excusas} excusa</span>}
                    </span>
                    {c.tema && <span className="mt-0.5 block truncate text-[11px] text-muted">{c.tema}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="px-1 text-[11px] leading-4 text-muted">
          P = presente · A = ausente (suma fallas) · T = tarde (no suma) · E = excusa (suma como falla justificada).
        </p>
      </aside>
    </div>
  );
}
