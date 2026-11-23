"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconCheck } from "@/components/icons";
import { cambiarClave, type EstadoFormulario } from "../actions";
import { BotonPrimario, Campo, MensajeError, Tarjeta, claseInput } from "./tarjeta";

const inicial: EstadoFormulario = { error: null };

export function CambiarClaveForm({ nombre, obligatorio }: { nombre: string; obligatorio: boolean }) {
  const [estado, accion, pendiente] = useActionState(cambiarClave, inicial);
  const [nueva, setNueva] = useState("");
  const actualRef = useRef<HTMLInputElement>(null);
  const nuevaRef = useRef<HTMLInputElement>(null);
  const confirmacionRef = useRef<HTMLInputElement>(null);

  // Tras un error, el foco vuelve al campo a corregir.
  useEffect(() => {
    if (!estado.error) return;
    const refs: Record<string, React.RefObject<HTMLInputElement | null>> = {
      actual: actualRef,
      nueva: nuevaRef,
      confirmacion: confirmacionRef,
    };
    refs[estado.campo ?? ""]?.current?.focus();
  }, [estado]);

  // Guía en vivo; la validación real (incluye "no contener el documento") la hace el servidor.
  const reglas = [
    { ok: nueva.length >= 8, texto: "Al menos 8 caracteres" },
    { ok: /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(nueva) && /\d/.test(nueva), texto: "Letras y números" },
  ];

  return (
    <Tarjeta titulo="Cambiar contraseña">
      <p className="mb-5 text-muted">
        {obligatorio ? (
          <>
            {nombre}, está usando una clave temporal. Antes de continuar, elija una contraseña personal que solo usted
            conozca.
          </>
        ) : (
          "Al cambiarla se cerrarán sus sesiones abiertas en otros equipos."
        )}
      </p>

      <form action={accion} className="space-y-4" noValidate>
        <Campo id="actual" etiqueta={obligatorio ? "Clave temporal" : "Contraseña actual"} error={estado.campo === "actual"}>
          <input ref={actualRef} id="actual" name="actual" type="password" autoComplete="current-password" required autoFocus className={claseInput(estado.campo === "actual")} />
        </Campo>

        <Campo
          id="nueva"
          etiqueta="Nueva contraseña"
          error={estado.campo === "nueva"}
          ayuda={
            <ul className="flex gap-4">
              {reglas.map((r) => (
                <li key={r.texto} className={`flex items-center gap-1 ${r.ok ? "text-ok" : ""}`}>
                  <IconCheck className={`size-3 ${r.ok ? "" : "opacity-30"}`} />
                  {r.texto}
                </li>
              ))}
            </ul>
          }
        >
          <input
            ref={nuevaRef}
            id="nueva"
            name="nueva"
            type="password"
            autoComplete="new-password"
            required
            maxLength={72}
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            className={claseInput(estado.campo === "nueva")}
          />
        </Campo>

        <Campo id="confirmacion" etiqueta="Confirme la nueva contraseña" error={estado.campo === "confirmacion"}>
          <input ref={confirmacionRef} id="confirmacion" name="confirmacion" type="password" autoComplete="new-password" required maxLength={72} className={claseInput(estado.campo === "confirmacion")} />
        </Campo>

        {estado.error && <MensajeError>{estado.error}</MensajeError>}

        <BotonPrimario pendiente={pendiente} textoPendiente="Guardando…">
          Guardar contraseña
        </BotonPrimario>
      </form>

      {obligatorio ? (
        <form action="/salir" method="post" className="mt-4 text-center">
          <button type="submit" className="text-xs font-medium text-muted hover:text-ink hover:underline">
            Salir sin cambiarla
          </button>
        </form>
      ) : (
        <p className="mt-4 text-center">
          <Link href="/" className="text-xs font-medium text-muted hover:text-ink hover:underline">
            Cancelar
          </Link>
        </p>
      )}
    </Tarjeta>
  );
}
