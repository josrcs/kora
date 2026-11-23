import { DesempenoBadge } from "@/components/desempeno-badge";
import { IconLock } from "@/components/icons";
import { formatNota, type Escala } from "@/lib/grading/calc";
import type { NotaConvivenciaPortal } from "@/features/convivencia/server/notas";

/** Anillo de progreso con la nota (0 → máximo de la escala). */
function Anillo({ nota, escala }: { nota: number; escala: Escala }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, (nota - escala.min) / (escala.max - escala.min)));
  const bajo = nota < escala.aprobatoria;
  return (
    <svg viewBox="0 0 80 80" className="size-24 -rotate-90" aria-hidden>
      <circle cx="40" cy="40" r={r} fill="none" stroke="rgb(255 255 255 / 0.14)" strokeWidth="8" />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        stroke={bajo ? "#fca5a5" : "url(#kora-anillo)"}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${c * frac} ${c}`}
        className="anim-trazo-anillo"
        style={{ transition: "stroke-dasharray 900ms cubic-bezier(.2,.8,.2,1)" }}
      />
      <defs>
        <linearGradient id="kora-anillo" x1="0" y1="0" x2="80" y2="80">
          <stop stopColor="#7fb2ff" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function ConvivenciaPortal({ filas, escala }: { filas: NotaConvivenciaPortal[]; escala: Escala }) {
  const publicadas = filas.filter((f) => f.nota !== null);
  const ultima = publicadas.at(-1);
  const promedio = publicadas.length ? Math.round((publicadas.reduce((s, f) => s + (f.nota ?? 0), 0) / publicadas.length) * 10) / 10 : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="anim-escalonado grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="panel-kora relative flex items-center gap-4 overflow-hidden rounded-3xl px-6 py-5 text-white">
          {ultima ? (
            <>
              <div className="relative">
                <Anillo nota={ultima.nota!} escala={escala} />
                <span className="absolute inset-0 grid place-items-center font-display text-2xl font-extrabold">{formatNota(ultima.nota, escala.decimales)}</span>
              </div>
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-blue-200/80 uppercase">Convivencia · {ultima.periodo}</p>
                <p className="mt-1 font-display text-xl font-bold">
                  {ultima.desempeno === "SUPERIOR" || ultima.desempeno === "ALTO" ? "¡Muy bien!" : ultima.desempeno === "BASICO" ? "Vas bien" : "A mejorar"}
                </p>
                <div className="mt-2">
                  <DesempenoBadge desempeno={ultima.desempeno} />
                </div>
              </div>
            </>
          ) : (
            <p className="max-w-xs text-sm text-blue-100/90">Aún no hay notas de convivencia publicadas. Aparecen cuando coordinación cierra cada periodo.</p>
          )}
        </div>
        <div className="rounded-3xl border border-line bg-surface px-6 py-5 shadow-tarjeta">
          <p className="text-xs text-muted">Promedio de convivencia del año</p>
          <p className="font-display text-3xl font-extrabold text-brand">{promedio === null ? "—" : formatNota(promedio, escala.decimales)}</p>
          <p className="mt-2 text-[13px] leading-5 text-ink-soft">
            La nota de convivencia valora el cumplimiento del Manual de Convivencia, el respeto y la participación. La registra tu director de
            grupo o coordinación.
          </p>
        </div>
      </div>

      <ol className="anim-escalonado space-y-2">
        {filas.map((f) => (
          <li key={f.numero} className="tarjeta-viva flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-surface px-5 py-3.5 shadow-tarjeta">
            <span className="grid size-10 place-items-center rounded-xl bg-brand-soft font-display font-bold text-brand">{f.numero}</span>
            <div className="min-w-40 flex-1">
              <p className="font-semibold text-ink">{f.periodo}</p>
              {f.observacion && <p className="text-[13px] text-ink-soft">{f.observacion}</p>}
            </div>
            {f.cerrado ? (
              f.nota === null ? (
                <span className="text-xs text-muted">Sin nota registrada</span>
              ) : (
                <>
                  <span className={`font-mono text-lg font-bold ${f.nota < escala.aprobatoria ? "text-bad" : "text-ink"}`}>{formatNota(f.nota, escala.decimales)}</span>
                  <DesempenoBadge desempeno={f.desempeno} />
                </>
              )
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <IconLock className="size-3" /> En curso: se publica al cerrar el periodo
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
