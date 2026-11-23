import { fechaHora, fechaLarga, SITUACION, TIPO_ANOTACION } from "../formato";
import type { AnotacionPortal } from "../types";
import { DescargosForm, FirmaForm } from "./observador-acciones";

const BORDE: Record<AnotacionPortal["tipo"], string> = {
  FELICITACION: "border-l-ok",
  ACADEMICA: "border-l-brand",
  COMPROMISO: "border-l-warn",
  CONVIVENCIA: "border-l-bad",
  DISCIPLINARIA: "border-l-bad",
};

export function ObservadorLista({ anotaciones, esAcudiente }: { anotaciones: AnotacionPortal[]; esAcudiente: boolean }) {
  if (anotaciones.length === 0) {
    return <p className="text-muted">No hay anotaciones en el observador del estudiante.</p>;
  }
  const pendientes = anotaciones.filter((a) => !a.firma).length;

  return (
    <div className="max-w-3xl space-y-3">
      {esAcudiente && pendientes > 0 && (
        <p className="rounded-sm border border-warn-line bg-warn-soft px-3 py-2 text-warn">
          {pendientes === 1 ? "Hay 1 anotación pendiente" : `Hay ${pendientes} anotaciones pendientes`} de su firma.
        </p>
      )}
      <ol className="space-y-3">
        {anotaciones.map((a) => (
          <li key={a.id} className={`rounded-sm border border-line border-l-4 bg-surface ${BORDE[a.tipo]}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2">
              <p className="font-medium">
                {TIPO_ANOTACION[a.tipo]}
                {a.situacion && <span className="ml-2 text-xs font-normal text-muted">{SITUACION[a.situacion]} (Ley 1620)</span>}
              </p>
              <p className="text-xs text-muted">
                {fechaLarga(a.fecha)} · {a.autor}
              </p>
            </div>
            <div className="space-y-2 px-4 py-3">
              <p>{a.descripcion}</p>
              {a.accionPedagogica && (
                <p className="text-ink-soft">
                  <span className="font-medium">Acción pedagógica: </span>
                  {a.accionPedagogica}
                </p>
              )}
              {a.descargos && (
                <div className="rounded-sm border border-line bg-canvas px-3 py-2">
                  <p className="text-xs font-medium text-muted">Descargos del estudiante · {a.descargosAt && fechaHora(a.descargosAt)}</p>
                  <p className="mt-0.5 whitespace-pre-line">{a.descargos}</p>
                </div>
              )}
              {a.puedeDescargos && <DescargosForm anotacionId={a.id} />}
            </div>
            <div className="border-t border-line px-4 py-2 text-xs">
              {a.firma ? (
                <p className="text-ok">
                  Firmada por {a.firma.acudiente} (acudiente) el {fechaHora(a.firma.en)}
                </p>
              ) : a.puedeFirmar ? (
                <FirmaForm anotacionId={a.id} />
              ) : (
                <p className="text-warn">Pendiente de firma del acudiente</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
