import Link from "next/link";
import { DesempenoBadge } from "@/components/desempeno-badge";
import { IconAlert, IconDocument, IconEstrella, IconLock } from "@/components/icons";
import { formatNota, type Escala } from "@/lib/grading/calc";
import type { PuntoPeriodo, ResumenHijo } from "../server/resumen";

/** Mini gráfico de la evolución del promedio por periodo publicado. */
function Evolucion({ puntos, escala }: { puntos: PuntoPeriodo[]; escala: Escala }) {
  const conDato = puntos.filter((p) => p.promedio !== null);
  if (conDato.length < 2) return null;
  const W = 160;
  const H = 44;
  const x = (i: number) => 8 + (i * (W - 16)) / (puntos.length - 1);
  // Eje ajustado a las notas (y a la aprobatoria) para que los cambios se noten.
  const valores = conDato.map((p) => p.promedio as number);
  const lo = Math.max(escala.min, Math.min(...valores, escala.aprobatoria) - 0.3);
  const hi = Math.min(escala.max, Math.max(...valores, escala.aprobatoria) + 0.3);
  const y = (n: number) => H - 6 - ((n - lo) / (hi - lo)) * (H - 12);
  const ruta = puntos
    .map((p, i) => (p.promedio === null ? null : `${x(i)},${y(p.promedio)}`))
    .filter(Boolean)
    .join(" L ");
  const linea = y(escala.aprobatoria);
  return (
    <figure className="shrink-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-11 w-40" role="img" aria-label={`Promedio por periodo: ${conDato.map((p) => `${p.nombre} ${p.promedio?.toFixed(1)}`).join(", ")}`}>
        <line x1="4" x2={W - 4} y1={linea} y2={linea} stroke="var(--color-bad-line)" strokeDasharray="3 3" />
        <path d={`M ${ruta}`} fill="none" stroke="var(--color-cielo)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="anim-trazo" />
        {puntos.map((p, i) =>
          p.promedio === null ? null : (
            <circle key={p.numero} cx={x(i)} cy={y(p.promedio)} r="3.2" fill="var(--color-surface)" stroke="var(--color-brand)" strokeWidth="2">
              <title>{`${p.nombre}: ${p.promedio.toFixed(2)}`}</title>
            </circle>
          ),
        )}
      </svg>
      <figcaption className="text-center text-[10px] text-muted">{conDato.map((p) => `P${p.numero}`).join(" · ")}</figcaption>
    </figure>
  );
}

function Indicador({ etiqueta, valor, tono = "text-ink", detalle }: { etiqueta: string; valor: React.ReactNode; tono?: string; detalle?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-canvas px-3 py-2.5">
      <p className="text-[11px] text-muted">{etiqueta}</p>
      <p className={`font-display text-lg leading-6 font-bold ${tono}`}>{valor}</p>
      {detalle && <div className="mt-0.5">{detalle}</div>}
    </div>
  );
}

export function TarjetaHijo({ hijo, escala }: { hijo: ResumenHijo; escala: Escala }) {
  const href = (vista?: string) => `/portal?estudiante=${hijo.id}${vista ? `&vista=${vista}` : ""}`;
  const d = escala.decimales;
  const alerta = hijo.enBajo > 0 || hijo.procesosAbiertos > 0 || hijo.convivencia?.desempeno === "BAJO";
  const iniciales = hijo.nombre
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((p) => p[0])
    .join("");

  return (
    <article className="tarjeta-viva overflow-hidden rounded-3xl border border-line bg-surface shadow-tarjeta">
      <header className="panel-kora flex flex-wrap items-center gap-4 px-5 py-4 text-white">
        <span className="grid size-12 place-items-center rounded-2xl bg-white/10 font-display text-lg font-bold ring-1 ring-white/20">{iniciales}</span>
        <div className="min-w-[11rem] flex-1">
          <h2 className="text-lg leading-tight font-bold">{hijo.nombre}</h2>
          <p className="text-xs text-blue-100/80">
            {hijo.grado ? `${hijo.grado} · Grupo ${hijo.grupo}` : "Sin matrícula activa este año"}
            {hijo.director && ` · Director(a): ${hijo.director}`}
          </p>
        </div>
        {alerta ? (
          <span className="rounded-full bg-warn-soft px-2.5 py-1 text-[11px] font-semibold text-warn">Requiere atención</span>
        ) : (
          hijo.periodo && <span className="rounded-full bg-ok-soft px-2.5 py-1 text-[11px] font-semibold text-ok">Todo en orden</span>
        )}
      </header>

      <div className="space-y-4 px-5 py-4">
        {!hijo.periodo ? (
          <p className="flex items-center gap-2 text-sm text-ink-soft">
            <IconLock className="size-4 text-muted" /> Aún no hay boletines publicados este año.
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs text-muted">Promedio · {hijo.periodo.nombre}</p>
              <div className="flex items-baseline gap-2">
                <span className={`font-display text-4xl font-extrabold ${hijo.desempeno === "BAJO" ? "text-bad" : "text-brand"}`}>
                  {hijo.promedio === null ? "—" : formatNota(Math.round(hijo.promedio * 10) / 10, 1)}
                </span>
                {hijo.tendencia !== null && hijo.tendencia !== 0 && (
                  <span className={`text-sm font-semibold ${hijo.tendencia > 0 ? "text-ok" : "text-bad"}`}>
                    {hijo.tendencia > 0 ? "▲" : "▼"} {Math.abs(hijo.tendencia).toFixed(2)}
                  </span>
                )}
                <DesempenoBadge desempeno={hijo.desempeno} />
              </div>
            </div>
            <Evolucion puntos={hijo.historial} escala={escala} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Indicador
            etiqueta="Asignaturas en bajo"
            valor={hijo.periodo ? `${hijo.enBajo} de ${hijo.asignaturas}` : "—"}
            tono={hijo.enBajo ? "text-bad" : "text-ok"}
          />
          <Indicador
            etiqueta="Convivencia"
            valor={hijo.convivencia ? formatNota(hijo.convivencia.nota, d) : "—"}
            tono={hijo.convivencia?.desempeno === "BAJO" ? "text-bad" : "text-brand"}
            detalle={hijo.convivencia && <DesempenoBadge desempeno={hijo.convivencia.desempeno} />}
          />
          <Indicador etiqueta="Fallas en el año (horas)" valor={hijo.fallasAnio} tono={hijo.fallasAnio >= 20 ? "text-warn" : "text-ink"} />
          <Indicador
            etiqueta="Observador"
            valor={hijo.porFirmar ? `${hijo.porFirmar} por firmar` : "Al día"}
            tono={hijo.porFirmar ? "text-warn" : "text-ok"}
            detalle={hijo.procesosAbiertos > 0 && <span className="text-[11px] font-semibold text-bad">{hijo.procesosAbiertos} proceso abierto</span>}
          />
        </div>

        {hijo.periodoEnCurso && (
          <p className="text-xs text-muted">
            {hijo.periodoEnCurso} en curso: sus notas se publican cuando coordinación cierre el periodo. Mientras tanto, revise el informe preventivo.
          </p>
        )}

        <nav aria-label={`Accesos de ${hijo.nombre}`} className="flex flex-wrap gap-2">
          {[
            { v: undefined, t: "Boletín", i: <IconDocument className="size-3.5" /> },
            { v: "preventivo", t: "Informe preventivo", i: <IconAlert className="size-3.5" /> },
            { v: "convivencia", t: "Convivencia", i: <IconEstrella className="size-3.5" /> },
            { v: "observador", t: hijo.porFirmar ? `Observador (${hijo.porFirmar})` : "Observador", i: <IconAlert className="size-3.5" /> },
          ].map((a) => (
            <Link
              key={a.t}
              href={href(a.v)}
              className="btn-kora flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink-soft hover:border-cielo hover:bg-cielo-soft hover:text-brand"
            >
              {a.i}
              {a.t}
            </Link>
          ))}
        </nav>
      </div>
    </article>
  );
}
