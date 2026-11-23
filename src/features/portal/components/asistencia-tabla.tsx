import type { AsistenciaData } from "../types";

/** Horas de inasistencia por asignatura y periodo, con el % aproximado sobre las horas programadas. */
export function AsistenciaTabla({ data }: { data: AsistenciaData }) {
  if (data.periodos.length === 0) {
    return <p className="text-muted">El año lectivo aún no ha comenzado.</p>;
  }
  const enCurso = data.periodos.some((p) => !p.cerrado);
  const total = Object.values(data.totales).reduce((s, n) => s + n, 0);

  return (
    <div className="max-w-5xl space-y-3">
      <div className="overflow-x-auto rounded-sm border border-line bg-surface">
        <table className="w-full min-w-[36rem] border-collapse text-[13px]">
          <thead className="bg-slate-50 text-[11px] font-medium uppercase tracking-wider text-muted">
            <tr className="border-b border-line">
              <th scope="col" className="px-4 py-2 text-left font-medium">Asignatura</th>
              <th scope="col" className="w-12 px-2 py-2 text-center font-medium" title="Intensidad horaria semanal">IH</th>
              {data.periodos.map((p) => (
                <th key={p.id} scope="col" className="w-28 px-2 py-2 text-center font-medium">
                  P{p.numero}
                  {!p.cerrado && <span className="block text-[10px] normal-case tracking-normal text-warn">en curso</span>}
                </th>
              ))}
              <th scope="col" className="w-20 px-4 py-2 text-center font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.filas.map((f) => (
              <tr key={f.asignatura} className="border-b border-line">
                <td className="px-4 py-2">
                  <span className="font-medium">{f.asignatura}</span>
                  <span className="block text-xs text-muted">{f.area}</span>
                </td>
                <td className="px-2 py-2 text-center font-mono text-muted tabular-nums">{f.intensidadHoraria}</td>
                {data.periodos.map((p) => {
                  const horas = f.fallas[p.id];
                  const pct = horas ? Math.round((horas / (f.intensidadHoraria * p.semanas)) * 100) : 0;
                  return (
                    <td key={p.id} className="px-2 py-2 text-center font-mono tabular-nums">
                      {horas ? (
                        <>
                          {horas} h<span className={`ml-1 text-xs ${pct >= 15 ? "text-bad" : "text-muted"}`}>({pct}%)</span>
                        </>
                      ) : (
                        <span className="text-slate-300">0</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-4 py-2 text-center font-mono font-semibold tabular-nums">{f.total}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 text-xs">
            <tr>
              <th scope="row" colSpan={2} className="px-4 py-2 text-left font-medium uppercase tracking-wider text-muted">
                Total de horas
              </th>
              {data.periodos.map((p) => (
                <td key={p.id} className="px-2 py-2 text-center font-mono font-semibold tabular-nums">{data.totales[p.id]}</td>
              ))}
              <td className="px-4 py-2 text-center font-mono font-semibold tabular-nums">{total}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted">
        El porcentaje es aproximado: horas de inasistencia sobre las horas programadas de la asignatura en el periodo
        (intensidad semanal × semanas).
        {enCurso && " Las cifras del periodo en curso pueden cambiar mientras los docentes actualizan sus planillas."}
      </p>
    </div>
  );
}
