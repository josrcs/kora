import { DesempenoBadge } from "@/components/desempeno-badge";
import { DESEMPENO_LABEL, formatNota, reprueba } from "@/lib/grading/calc";
import { SelloInstitucion } from "@/features/auth/components/tarjeta";
import { fechaLarga, TIPO_DOCUMENTO } from "../formato";
import type { BoletinData } from "../types";

/** El boletín en pantalla: misma información y orden que el PDF, con apariencia de documento. */
export function BoletinDocumento({ data }: { data: BoletinData }) {
  const { membrete, estudiante, periodo, periodosPublicados, escala, resumen } = data;
  const d = escala.decimales;

  return (
    <article className="mx-auto max-w-5xl rounded-sm border border-line bg-surface">
      {/* Membrete */}
      <header className="flex items-start gap-4 border-b-2 border-navy px-6 py-5">
        <SelloInstitucion nombre={membrete.nombre} logoUrl={membrete.logoUrl} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold uppercase tracking-tight">{membrete.nombre}</p>
          {membrete.resolucion && <p className="text-xs text-muted">{membrete.resolucion}</p>}
          <p className="text-xs text-muted">
            {[membrete.direccion, membrete.telefono, `${membrete.municipio}, ${membrete.departamento}`].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Informe académico</p>
          <p className="font-semibold">{periodo.nombre}</p>
          <p className="text-xs text-muted">Año lectivo {data.anio}</p>
        </div>
      </header>

      {/* Datos del estudiante */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-b border-line px-6 py-4 sm:grid-cols-4">
        <Dato etiqueta="Estudiante" valor={estudiante.nombre} ancho />
        <Dato etiqueta="Documento" valor={`${TIPO_DOCUMENTO[estudiante.tipoDocumento] ?? estudiante.tipoDocumento} ${estudiante.documento}`} />
        <Dato etiqueta="Grado y grupo" valor={`${estudiante.grado} · ${estudiante.grupo}`} />
        <Dato etiqueta="Jornada" valor={estudiante.jornada} />
        <Dato etiqueta="Director(a) de grupo" valor={estudiante.director ?? "—"} ancho />
        <Dato etiqueta="Periodo" valor={`${periodo.porcentaje}% del año · ${fechaLarga(periodo.fechaInicio)} – ${fechaLarga(periodo.fechaFin)}`} ancho />
      </dl>

      {/* Calificaciones */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-[13px]">
          <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wider text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="px-6 py-2 text-left font-medium">Asignatura</th>
              <th scope="col" className="w-12 px-2 py-2 text-center font-medium" title="Intensidad horaria semanal">IH</th>
              {periodosPublicados.map((p) => (
                <th key={p.id} scope="col" className="w-12 px-2 py-2 text-center font-medium" title={p.nombre}>
                  P{p.numero}
                </th>
              ))}
              <th scope="col" className="w-24 px-2 py-2 text-center font-medium">Desempeño</th>
              <th scope="col" className="w-14 px-2 py-2 text-center font-medium" title="Horas de inasistencia en el periodo">Fallas</th>
              <th scope="col" className="w-16 px-2 py-2 pr-6 text-center font-medium" title="Ponderado de los periodos publicados">Acum.</th>
            </tr>
          </thead>
          <tbody>
            {data.areas.map((area) => (
              <AreaFilas key={area.nombre} area={area} data={data} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Resumen y escala */}
      <div className="grid gap-4 border-t border-line px-6 py-4 sm:grid-cols-2">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
          <dt className="text-muted">Promedio del periodo</dt>
          <dd className="font-mono font-semibold tabular-nums">{resumen.promedio === null ? "—" : formatNota(resumen.promedio, 2)}</dd>
          <dt className="text-muted">Asignaturas en desempeño bajo</dt>
          <dd className={`font-mono font-semibold tabular-nums ${resumen.enBajo ? "text-bad" : ""}`}>{resumen.enBajo}</dd>
          <dt className="text-muted">Fallas del periodo (horas)</dt>
          <dd className="font-mono font-semibold tabular-nums">{resumen.fallas}</dd>
          {resumen.sinNota > 0 && (
            <>
              <dt className="text-muted">Asignaturas sin calificación</dt>
              <dd className="font-mono font-semibold tabular-nums text-warn">{resumen.sinNota}</dd>
            </>
          )}
        </dl>
        <div className="text-xs leading-5 text-muted">
          <p className="font-medium text-ink-soft">Escala de valoración (Decreto 1290 de 2009)</p>
          <p>
            {[...escala.niveles]
              .reverse()
              .map((n) => `${DESEMPENO_LABEL[n.desempeno]} ${formatNota(n.desde, d)}–${formatNota(n.hasta, d)}`)
              .join(" · ")}
          </p>
          <p>Nota mínima aprobatoria: {formatNota(escala.aprobatoria, d)}</p>
        </div>
      </div>
    </article>
  );
}

function AreaFilas({ area, data }: { area: BoletinData["areas"][number]; data: BoletinData }) {
  const { escala, periodosPublicados, periodo } = data;
  const d = escala.decimales;
  const columnas = periodosPublicados.length + 5;
  return (
    <>
      <tr className="border-b border-line bg-slate-50/60">
        <th colSpan={columnas} scope="rowgroup" className="px-6 py-1.5 text-left text-[11px] font-medium uppercase tracking-wider text-ink-soft">
          {area.nombre}
        </th>
      </tr>
      {area.filas.map((f) => (
        <tr key={f.asignatura} className="border-b border-line align-top">
          <td className="px-6 py-2.5">
            <p className="font-medium">{f.asignatura}</p>
            <p className="text-xs text-muted">{f.docente}</p>
            {f.logros.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-xs leading-5 text-ink-soft">
                {f.logros.map((l) => (
                  <li key={l.codigo} className="flex gap-2">
                    <span className="w-6 shrink-0 font-mono text-muted">{l.codigo}</span>
                    <span>{l.descripcion}</span>
                  </li>
                ))}
              </ul>
            )}
            {f.observacion && <p className="mt-1.5 text-xs text-ink-soft italic">Observación: {f.observacion}</p>}
          </td>
          <td className="px-2 py-2.5 text-center font-mono text-muted tabular-nums">{f.intensidadHoraria}</td>
          {periodosPublicados.map((p) => {
            const n = f.notas[p.id];
            const actual = p.id === periodo.id;
            return (
              <td
                key={p.id}
                className={`px-2 py-2.5 text-center font-mono tabular-nums ${actual ? "font-semibold" : "text-ink-soft"} ${
                  n !== null && reprueba(n, escala) ? "text-bad" : ""
                }`}
              >
                {n === null ? "—" : formatNota(n, d)}
              </td>
            );
          })}
          <td className="px-2 py-2.5 text-center">
            {f.nota === null ? <span className="text-xs text-warn">Sin nota</span> : <DesempenoBadge desempeno={f.desempeno} />}
          </td>
          <td className="px-2 py-2.5 text-center font-mono tabular-nums">{f.fallas || "—"}</td>
          <td className={`px-2 py-2.5 pr-6 text-center font-mono tabular-nums ${f.acumulado !== null && reprueba(f.acumulado, escala) ? "text-bad" : ""}`}>
            {f.acumulado === null ? "—" : formatNota(f.acumulado, d)}
          </td>
        </tr>
      ))}
    </>
  );
}

function Dato({ etiqueta, valor, ancho }: { etiqueta: string; valor: string; ancho?: boolean }) {
  return (
    <div className={ancho ? "col-span-2" : ""}>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-muted">{etiqueta}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );
}
