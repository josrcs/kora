import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { IconMegafono } from "@/components/icons";
import { getResumenAcudiente } from "@/features/portal/server/resumen";
import { TarjetaHijo } from "@/features/portal/components/panel-acudiente";
import { avisosParaUsuario } from "@/features/avisos/server";
import { TIPO_AVISO, fechaAviso } from "@/features/avisos/components/aviso-tarjeta";
import { Cargando } from "@/features/periodos/components/estados";

export const metadata: Metadata = { title: "Resumen" };

const saludo = () => {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: "America/Bogota", hour: "numeric", hour12: false }));
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
};

/** Panel de entrada del acudiente: todos sus hijos de un vistazo y los avisos sin leer. */
export default function ResumenAcudientePage() {
  return (
    <Suspense fallback={<Cargando />}>
      <Panel />
    </Suspense>
  );
}

async function Panel() {
  const session = await requireSession(["GUARDIAN"]);
  const [{ hijos, escala }, avisos] = await Promise.all([getResumenAcudiente(session), avisosParaUsuario(session, 30)]);
  const sinLeer = avisos.filter((a) => !a.leido);
  const atencion = hijos.filter((h) => h.enBajo > 0 || h.procesosAbiertos > 0 || h.porFirmar > 0 || h.convivencia?.desempeno === "BAJO").length;
  const nombre = session.nombre.split(" ")[0];

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 lg:px-6">
      <div className="anim-entrar">
        <p className="text-xs font-semibold tracking-[0.14em] text-cielo uppercase">Panel del acudiente</p>
        <h1 className="mt-1 text-2xl font-extrabold text-ink">
          {saludo()}, {nombre}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">
          {hijos.length === 0
            ? "No hay estudiantes vinculados a su cuenta."
            : `${hijos.length === 1 ? "Su acudido" : `Sus ${hijos.length} acudidos`} en ${session.institucion.nombre}.`}
          {atencion > 0 && <span className="font-semibold text-warn"> {atencion === 1 ? "Uno requiere" : `${atencion} requieren`} su atención.</span>}
        </p>
      </div>

      {hijos.length === 0 ? (
        <p className="max-w-xl rounded-2xl border border-line bg-surface px-4 py-3 text-ink-soft">
          Comuníquese con la secretaría de la institución para registrar el vínculo con sus hijos o acudidos.
        </p>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section aria-label="Estudiantes" className="anim-escalonado space-y-4">
            {hijos.map((h) => (
              <TarjetaHijo key={h.id} hijo={h} escala={escala} />
            ))}
          </section>

          <aside aria-labelledby="avisos-titulo" className="anim-entrar space-y-3 lg:sticky lg:top-20">
            <div className="rounded-3xl border border-line bg-surface p-4 shadow-tarjeta">
              <div className="flex items-center gap-2">
                <span className="relative grid size-9 place-items-center rounded-xl bg-brand text-white">
                  <IconMegafono className="size-4" />
                  {sinLeer.length > 0 && (
                    <span className="anim-pulso absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-cielo text-[9px] font-bold ring-2 ring-surface">
                      {sinLeer.length}
                    </span>
                  )}
                </span>
                <h2 id="avisos-titulo" className="font-bold">
                  Avisos sin leer
                </h2>
              </div>
              {sinLeer.length === 0 ? (
                <p className="mt-3 text-sm text-muted">Está al día con los avisos del colegio.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {sinLeer.slice(0, 4).map((a) => (
                    <li key={a.id} className="rounded-xl border border-line px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${TIPO_AVISO[a.tipo].clase}`}>{TIPO_AVISO[a.tipo].texto}</span>
                        <span className="text-[11px] text-muted">{fechaAviso(a.fecha)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[13px] font-semibold text-ink">{a.titulo}</p>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/portal/avisos"
                className="btn-kora mt-3 flex h-9 items-center justify-center rounded-xl bg-gradient-to-r from-petroleo to-brand text-sm font-semibold text-white"
              >
                {sinLeer.length ? "Leer avisos" : "Ver todos los avisos"}
              </Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
