"use client";

import { useActionState, useState, useTransition } from "react";
import { archivarAviso, fijarAviso, publicarAviso, type EstadoAviso } from "../actions";

const inicial: EstadoAviso = { ok: false, error: null };
const campo =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-[13px] outline-none focus-visible:border-cielo focus-visible:ring-2 focus-visible:ring-cielo/20";

export function FormAviso() {
  const [estado, accion, pendiente] = useActionState(publicarAviso, inicial);
  const [clave, setClave] = useState(0);
  const [previo, setPrevio] = useState(estado);
  if (previo !== estado) {
    setPrevio(estado);
    if (estado.ok) setClave((k) => k + 1); // limpia el formulario después de publicar
  }

  return (
    <form key={clave} action={accion} className="space-y-3 rounded-2xl border border-line bg-surface p-5 shadow-tarjeta">
      <h2 className="font-display text-base font-bold">Nuevo aviso o comunicado</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-ink-soft">
          Tipo
          <select name="tipo" defaultValue="AVISO" className={campo}>
            <option value="AVISO">Aviso</option>
            <option value="COMUNICADO">Comunicado oficial</option>
            <option value="URGENTE">Urgente</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-ink-soft">
          Para
          <select name="audiencia" defaultValue="TODOS" className={campo}>
            <option value="TODOS">Todos los estudiantes y acudientes</option>
            <option value="ESTUDIANTES">Solo estudiantes</option>
            <option value="ACUDIENTES">Solo acudientes</option>
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-xs font-medium text-ink-soft">
        Título
        <input name="titulo" required minLength={3} maxLength={140} placeholder="Ej.: Reunión de padres del cuarto periodo" className={campo} />
      </label>
      <label className="block space-y-1 text-xs font-medium text-ink-soft">
        Mensaje
        <textarea name="cuerpo" required minLength={10} maxLength={5000} rows={5} placeholder="Escriba el comunicado…" className={`${campo} resize-y leading-6`} />
      </label>
      <label className="flex items-center gap-2 text-[13px] text-ink-soft">
        <input type="checkbox" name="fijado" className="size-4 accent-brand" />
        Fijar arriba en el portal
      </label>
      {estado.error && <p className="rounded-lg border border-bad-line bg-bad-soft px-3 py-2 text-sm text-bad">{estado.error}</p>}
      {estado.ok && estado.mensaje && <p className="anim-pop rounded-lg border border-ok-line bg-ok-soft px-3 py-2 text-sm text-ok">{estado.mensaje}</p>}
      <button
        type="submit"
        disabled={pendiente}
        className="btn-kora h-10 rounded-xl bg-gradient-to-r from-petroleo to-brand px-5 font-semibold text-white shadow-[0_8px_20px_-10px_rgb(26_79_208/0.8)] disabled:opacity-60"
      >
        {pendiente ? "Publicando…" : "Publicar"}
      </button>
    </form>
  );
}

export function AccionesAviso({ id, fijado, archivado }: { id: string; fijado: boolean; archivado: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const btn = "rounded-lg border border-line-strong px-2.5 py-1 text-xs font-medium text-ink-soft hover:border-cielo hover:text-brand disabled:opacity-50";
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {!archivado && (
        <button type="button" disabled={pendiente} onClick={() => iniciar(() => fijarAviso(id, !fijado))} className={btn}>
          {fijado ? "Desfijar" : "Fijar arriba"}
        </button>
      )}
      <button type="button" disabled={pendiente} onClick={() => iniciar(() => archivarAviso(id, !archivado))} className={btn}>
        {archivado ? "Volver a publicar" : "Archivar (retirar del portal)"}
      </button>
    </div>
  );
}
