"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { IconCheck } from "@/components/icons";
import { estadoFormInicial, type EstadoForm } from "../types";

export type Accion = (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>;

export const campo =
  "mt-1 block h-8 w-full rounded-sm border border-line-strong bg-surface px-2 outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 disabled:bg-slate-50 disabled:text-muted";
export const etiqueta = "block text-xs font-medium text-ink-soft";
export const btnPrimario = "h-8 rounded-sm bg-brand px-3 font-medium text-white hover:bg-brand-hover disabled:opacity-50";
export const btnSecundario = "h-8 rounded-sm border border-line-strong bg-surface px-3 font-medium text-ink-soft hover:bg-slate-50 disabled:opacity-50";
export const btnTexto = "h-8 px-2 text-xs font-medium text-muted hover:text-ink disabled:opacity-50";
export const btnPeligro = "h-8 rounded-sm bg-bad px-3 font-medium text-white hover:bg-red-800 disabled:opacity-50";

/** Mensaje de la última acción. Las claves temporales se muestran aquí una sola vez. */
export function Resultado({ estado }: { estado: EstadoForm }) {
  if (estado.error) {
    return (
      <p role="alert" className="text-xs text-bad">
        {estado.error}
      </p>
    );
  }
  if (!estado.ok) return null;
  return (
    <div role="status" className="space-y-2">
      {estado.mensaje && (
        <p className="flex items-center gap-1.5 text-xs text-ok">
          <IconCheck className="size-3.5" /> {estado.mensaje}
        </p>
      )}
      {estado.secreto && estado.secreto.length > 0 && (
        <div className="rounded-sm border border-warn-line bg-warn-soft px-3 py-2 text-xs">
          <p className="font-medium text-warn">Claves temporales: anótelas y entréguelas ahora. No se vuelven a mostrar.</p>
          <ul className="mt-1.5 space-y-1">
            {estado.secreto.map((s) => (
              <li key={s.etiqueta} className="flex flex-wrap items-center gap-2">
                <span className="text-ink-soft">{s.etiqueta}:</span>
                <code className="rounded-sm border border-line bg-surface px-1.5 py-0.5 font-mono text-sm text-ink select-all">{s.valor}</code>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-muted">Al primer ingreso el sistema les pedirá cambiarla.</p>
        </div>
      )}
    </div>
  );
}

/** Formulario simple con useActionState: los campos van como `children`, el botón y el resultado los pone él. */
export function FormAccion({
  accion,
  children,
  boton,
  pendienteTexto = "Guardando…",
  className = "",
  extra,
  limpiarAlGuardar = true,
}: {
  accion: Accion;
  children: ReactNode;
  boton: string;
  pendienteTexto?: string;
  className?: string;
  extra?: ReactNode;
  /** Vaciar los campos tras guardar (formularios de creación). Si hay error, lo digitado se conserva. */
  limpiarAlGuardar?: boolean;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, estadoFormInicial);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok && limpiarAlGuardar) form.current?.reset();
  }, [estado, limpiarAlGuardar]);
  return (
    <form
      ref={form}
      // Envío manual: con `action={...}` React vacía el formulario incluso cuando la acción falla.
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => enviar(datos));
      }}
      className={`space-y-3 ${className}`}
    >
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pendiente} className={btnPrimario}>
          {pendiente ? pendienteTexto : boton}
        </button>
        {extra}
      </div>
      <Resultado estado={estado} />
    </form>
  );
}

/** Botón que pide confirmación en línea antes de ejecutar una acción delicada (activar, eliminar…). */
export function BotonConfirmado({
  accion,
  campos,
  texto,
  pregunta,
  confirmar,
  peligro,
  disabled,
  title,
}: {
  accion: Accion;
  campos: Record<string, string>;
  texto: string;
  pregunta: string;
  confirmar: string;
  peligro?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [estado, enviar, pendiente] = useActionState(accion, estadoFormInicial);
  if (!abierto || estado.ok) {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <button type="button" onClick={() => setAbierto(true)} disabled={disabled} title={title} className={peligro ? `${btnTexto} hover:text-bad` : btnSecundario}>
          {texto}
        </button>
        {estado.ok && <Resultado estado={estado} />}
      </span>
    );
  }
  return (
    <form action={enviar} className="flex flex-wrap items-center justify-end gap-2 rounded-sm border border-line bg-canvas px-2 py-1.5">
      {Object.entries(campos).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <span className="text-xs text-ink-soft">{pregunta}</span>
      <button type="submit" disabled={pendiente} className={peligro ? btnPeligro : btnPrimario}>
        {pendiente ? "…" : confirmar}
      </button>
      <button type="button" onClick={() => setAbierto(false)} className={btnTexto}>
        Cancelar
      </button>
      {estado.error && <span className="w-full text-right"><Resultado estado={estado} /></span>}
    </form>
  );
}

/** Sección plegable con un formulario ("+ Nuevo grupo"). */
export function Desplegable({ titulo, children, abiertoInicial = false }: { titulo: string; children: ReactNode; abiertoInicial?: boolean }) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  return (
    <div className="rounded-sm border border-dashed border-line-strong bg-surface">
      <button type="button" onClick={() => setAbierto(!abierto)} aria-expanded={abierto} className="w-full px-4 py-2 text-left font-medium text-brand hover:bg-slate-50">
        {abierto ? "−" : "+"} {titulo}
      </button>
      {abierto && <div className="border-t border-line px-4 py-3">{children}</div>}
    </div>
  );
}
