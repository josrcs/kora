import { FECHA_POLITICA, SECCIONES_POLITICA, VERSION_POLITICA } from "../politica";

/** Texto completo de la política (página pública y pantalla de autorización). */
export function PoliticaTexto({ compacta = false }: { compacta?: boolean }) {
  return (
    <div className={`space-y-5 leading-6 text-ink-soft ${compacta ? "text-[13px]" : "text-sm"}`}>
      <p className="text-xs text-muted">
        Versión {VERSION_POLITICA} · Vigente desde el {FECHA_POLITICA}
      </p>
      {SECCIONES_POLITICA.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-20">
          <h2 className={`font-bold text-ink ${compacta ? "text-sm" : "text-base"}`}>{s.titulo}</h2>
          {s.parrafos.map((p) => (
            <p key={p.slice(0, 40)} className="mt-2">
              {p}
            </p>
          ))}
          {s.lista && (
            <ul className="mt-2 space-y-1.5 pl-1">
              {s.lista.map((i) => (
                <li key={i.slice(0, 40)} className="flex gap-2">
                  <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-cielo" />
                  <span>{i}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
