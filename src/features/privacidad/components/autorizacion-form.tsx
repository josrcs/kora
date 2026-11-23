"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { aceptarPolitica, rechazarPolitica, type EstadoAutorizacion } from "../actions";
import type { Rol } from "@/db/schema";

const inicial: EstadoAutorizacion = { error: null };

function Casilla({ name, children, marcada, onChange }: { name: string; children: React.ReactNode; marcada: boolean; onChange: (v: boolean) => void }) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-xl border px-4 py-3 transition-colors ${
        marcada ? "border-brand/50 bg-brand-soft" : "border-line bg-surface hover:border-line-strong"
      }`}
    >
      <input type="checkbox" name={name} checked={marcada} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-brand" />
      <span className="text-[13px] leading-5 text-ink-soft">{children}</span>
    </label>
  );
}

/** Consentimiento expreso: casillas sin marcar por defecto, botón de aceptar y opción real de no aceptar. */
export function AutorizacionForm({ rol }: { rol: Rol }) {
  const [estado, accion, pendiente] = useActionState(aceptarPolitica, inicial);
  const [leida, setLeida] = useState(false);
  const [autoriza, setAutoriza] = useState(false);
  const [representante, setRepresentante] = useState(false);
  const esAcudiente = rol === "GUARDIAN";
  const esEstudiante = rol === "STUDENT";
  const listo = leida && autoriza && (!esAcudiente || representante);

  return (
    <div className="space-y-4">
      <form action={accion} className="space-y-3">
        <Casilla name="leida" marcada={leida} onChange={setLeida}>
          He leído la{" "}
          <Link href="/politica-de-datos" target="_blank" className="font-semibold text-brand hover:underline">
            Política de Tratamiento de Datos Personales
          </Link>{" "}
          y entiendo para qué se usan mis datos y cuáles son mis derechos.
        </Casilla>
        <Casilla name="autoriza" marcada={autoriza} onChange={setAutoriza}>
          {esEstudiante
            ? "Estoy de acuerdo con que el colegio use mis datos en Kora para registrar mis notas, mi convivencia y enviarme avisos. Sé que mi acudiente ya autorizó este uso al matricularme y que puedo preguntarle al colegio por mis datos cuando quiera."
            : "Autorizo de manera previa, expresa e informada el tratamiento de mis datos personales para las finalidades descritas, conforme a la Ley 1581 de 2012."}
        </Casilla>
        {esAcudiente && (
          <Casilla name="representante" marcada={representante} onChange={setRepresentante}>
            Soy representante legal (o estoy autorizado por él) de los estudiantes a mi cargo y autorizo el tratamiento de sus datos,
            incluidos los de convivencia, respetando su interés superior (art. 7 Ley 1581 de 2012 y art. 12 Decreto 1377 de 2013).
          </Casilla>
        )}

        {estado.error && (
          <p role="alert" className="rounded-lg border border-bad-line bg-bad-soft px-3 py-2 text-sm text-bad">
            {estado.error}
          </p>
        )}

        <button
          type="submit"
          disabled={!listo || pendiente}
          className="btn-kora flex h-12 w-full items-center justify-center rounded-xl bg-gradient-to-r from-petroleo to-brand text-base font-semibold text-white shadow-[0_10px_24px_-12px_rgb(26_79_208/0.8)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {pendiente ? "Registrando…" : "Acepto y continúo"}
        </button>
      </form>

      <form action={rechazarPolitica}>
        <button type="submit" className="w-full rounded-xl border border-line px-4 py-2.5 text-sm font-medium text-ink-soft hover:border-bad-line hover:bg-bad-soft hover:text-bad">
          No acepto
        </button>
        <p className="mt-2 text-center text-xs text-muted">
          Si no acepta, su cuenta no se activa y no podrá usar Kora. Puede cambiar de opinión en cualquier momento volviendo a ingresar.
        </p>
      </form>
    </div>
  );
}
