import type { EstadoAsistencia } from "@/db/schema";

type Fila = { fecha: string; horas: number; asignatura: string; estado: EstadoAsistencia; observacion: string | null };

const ESTILO: Record<Exclude<EstadoAsistencia, "PRESENTE">, { texto: string; clase: string }> = {
  AUSENTE: { texto: "Ausente", clase: "border-bad-line bg-bad-soft text-bad" },
  TARDE: { texto: "Llegó tarde", clase: "border-warn-line bg-warn-soft text-warn" },
  EXCUSA: { texto: "Con excusa", clase: "border-brand/30 bg-brand-soft text-brand" },
};

const fecha = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

/** Registro diario: cada clase en la que el estudiante faltó, llegó tarde o presentó excusa, agrupado por día. */
export function RegistroAsistencia({ filas }: { filas: Fila[] }) {
  const dias = [...new Map(filas.map((f) => [f.fecha, filas.filter((x) => x.fecha === f.fecha)])).entries()];
  return (
    <section aria-labelledby="registro-diario" className="max-w-5xl">
      <h2 id="registro-diario" className="font-display text-base font-bold">
        Registro diario de clases
      </h2>
      <p className="text-xs text-muted">Clases en las que faltó, llegó tarde o presentó excusa, según la lista que pasa cada docente.</p>
      {dias.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-ok-line bg-ok-soft px-4 py-3 text-sm text-ok">¡Asistencia perfecta! No hay ausencias ni tardanzas registradas.</p>
      ) : (
        <ol className="anim-escalonado mt-3 space-y-2">
          {dias.map(([dia, clases]) => (
            <li key={dia} className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-tarjeta">
              <p className="text-[13px] font-semibold text-ink first-letter:uppercase">{fecha(dia)}</p>
              <ul className="mt-1.5 space-y-1">
                {clases.map((c) => {
                  const e = ESTILO[c.estado as Exclude<EstadoAsistencia, "PRESENTE">];
                  return (
                    <li key={c.asignatura} className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${e.clase}`}>{e.texto}</span>
                      <span className="text-ink">{c.asignatura}</span>
                      {c.estado !== "TARDE" && <span className="text-xs text-muted">· {c.horas} h</span>}
                      {c.observacion && <span className="text-xs text-muted">· {c.observacion}</span>}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
