"use client";

import { useActionState } from "react";
import { generarCorte, type EstadoCorte } from "../actions";

const inicial: EstadoCorte = { ok: false, error: null };

export function GenerarCorte({ periodId, rehacer }: { periodId: string; rehacer: boolean }) {
  const [estado, enviar, pendiente] = useActionState(generarCorte, inicial);
  return (
    <form
      action={enviar}
      onSubmit={(e) => {
        if (rehacer && !window.confirm("¿Rehacer el corte? Reemplaza la foto anterior con las notas de hoy.")) e.preventDefault();
      }}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="periodId" value={periodId} />
      <button type="submit" disabled={pendiente} className="rounded-xl bg-petroleo px-4 py-2 text-sm font-semibold text-white hover:bg-petroleo-hover disabled:opacity-60">
        {pendiente ? "Generando…" : rehacer ? "Rehacer corte preventivo" : "Generar corte preventivo"}
      </button>
      {estado.error && (
        <p role="alert" className="text-xs text-bad">
          {estado.error}
        </p>
      )}
      {estado.ok && (
        <p role="status" className="text-xs text-ok">
          {estado.mensaje}
        </p>
      )}
    </form>
  );
}
