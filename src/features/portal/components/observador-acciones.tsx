"use client";

import { useActionState, useState } from "react";
import { firmarAnotacion, presentarDescargos, type EstadoAccion } from "../actions";

const inicial: EstadoAccion = { ok: false, error: null };

export function FirmaForm({ anotacionId }: { anotacionId: string }) {
  const [estado, accion, pendiente] = useActionState(firmarAnotacion, inicial);
  return (
    <form action={accion} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="anotacionId" value={anotacionId} />
      <p className="flex-1 text-muted">
        Al firmar, usted declara que conoce esta anotación. No implica estar de acuerdo con ella.
      </p>
      <button
        type="submit"
        disabled={pendiente}
        className="h-7 rounded-sm bg-brand px-3 font-medium text-white hover:bg-brand-hover disabled:opacity-70"
      >
        {pendiente ? "Firmando…" : "Firmar como enterado"}
      </button>
      {estado.error && (
        <p role="alert" className="w-full text-bad">
          {estado.error}
        </p>
      )}
    </form>
  );
}

export function DescargosForm({ anotacionId }: { anotacionId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [estado, accion, pendiente] = useActionState(presentarDescargos, inicial);
  const [texto, setTexto] = useState("");

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} className="text-xs font-medium text-brand hover:underline">
        Presentar descargos
      </button>
    );
  }
  return (
    <form action={accion} className="space-y-2 rounded-sm border border-line bg-canvas p-3">
      <input type="hidden" name="anotacionId" value={anotacionId} />
      <label htmlFor={`descargos-${anotacionId}`} className="block text-xs font-medium text-ink-soft">
        Sus descargos (su versión de los hechos). Una vez enviados no se pueden modificar.
      </label>
      <textarea
        id={`descargos-${anotacionId}`}
        name="descargos"
        rows={4}
        maxLength={4000}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="block w-full rounded-sm border border-line-strong bg-surface px-2.5 py-2 outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted">{texto.trim().length} / 4000</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => setAbierto(false)} className="h-7 px-3 text-xs font-medium text-muted hover:text-ink">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pendiente || texto.trim().length < 20}
            className="h-7 rounded-sm bg-brand px-3 text-xs font-medium text-white hover:bg-brand-hover disabled:opacity-50"
          >
            {pendiente ? "Enviando…" : "Enviar descargos"}
          </button>
        </div>
      </div>
      {estado.error && (
        <p role="alert" className="text-xs text-bad">
          {estado.error}
        </p>
      )}
    </form>
  );
}
