"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { guardarCambiosPlanilla } from "@/app/(app)/docente/planilla/actions";
import type { Cambio, GuardarResultado } from "../types";

/** Espera tras la última tecla antes de enviar. Corto para que se sienta inmediato, largo para agrupar una ráfaga. */
const DEBOUNCE_MS = 800;
const REINTENTO_MAX_MS = 30_000;

export type EstadoGuardado =
  | { tipo: "inicial" }
  | { tipo: "pendiente" }
  | { tipo: "guardando" }
  | { tipo: "guardado"; en: number }
  | { tipo: "error"; mensaje: string; reintentoEn: number | null }
  | { tipo: "bloqueado"; mensaje: string };

type Opciones = {
  assignmentId: string;
  periodId: string;
  onGuardado: (definitivas: Record<string, number | null>) => void;
  onBloqueo: (mensaje: string) => void;
};

/**
 * Cola de autoguardado silencioso:
 *  - agrupa por celda (si la misma celda cambia 3 veces, se envía 1 vez);
 *  - un solo envío en vuelo a la vez; lo que llega mientras tanto va en el siguiente lote;
 *  - si falla la red, devuelve el lote a la cola y reintenta con espera exponencial;
 *  - si el periodo se cerró o la sesión expiró, se bloquea y no reintenta;
 *  - guarda al ocultar la pestaña y avisa antes de cerrarla con cambios pendientes.
 */
export function useAutosave({ assignmentId, periodId, onGuardado, onBloqueo }: Opciones) {
  const [estado, setEstado] = useState<EstadoGuardado>({ tipo: "inicial" });

  const pendientes = useRef(new Map<string, Cambio>());
  const enVuelo = useRef(false);
  const bloqueado = useRef(false);
  const intentos = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cola = useRef<Promise<void>>(Promise.resolve());
  const callbacks = useRef({ onGuardado, onBloqueo });
  useEffect(() => {
    callbacks.current = { onGuardado, onBloqueo };
  });

  const enviar = useCallback(async () => {
    if (bloqueado.current || pendientes.current.size === 0) return;

    const lote = new Map(pendientes.current);
    pendientes.current.clear();
    enVuelo.current = true;
    setEstado({ tipo: "guardando" });

    let res: GuardarResultado;
    try {
      res = await guardarCambiosPlanilla({ assignmentId, periodId, cambios: [...lote.values()] });
    } catch {
      res = { ok: false, codigo: "ERROR", error: "Sin conexión con el servidor." };
    } finally {
      enVuelo.current = false;
    }

    if (res.ok) {
      intentos.current = 0;
      callbacks.current.onGuardado(res.definitivas);
      if (pendientes.current.size > 0) {
        setEstado({ tipo: "pendiente" });
        programar(DEBOUNCE_MS);
      } else {
        setEstado({ tipo: "guardado", en: Date.now() });
      }
      return;
    }

    // Devolver a la cola lo que no fue reemplazado por una edición más reciente.
    for (const [clave, cambio] of lote) {
      if (!pendientes.current.has(clave)) pendientes.current.set(clave, cambio);
    }

    if (res.codigo === "PERIODO_CERRADO" || res.codigo === "SIN_PERMISO" || res.codigo === "SIN_SESION") {
      bloqueado.current = true;
      setEstado({ tipo: "bloqueado", mensaje: res.error });
      callbacks.current.onBloqueo(res.error);
      return;
    }
    if (res.codigo === "VALIDACION") {
      // Reintentar el mismo dato inválido no sirve: se espera a que el docente corrija o reintente.
      setEstado({ tipo: "error", mensaje: res.error, reintentoEn: null });
      return;
    }

    intentos.current += 1;
    const espera = Math.min(REINTENTO_MAX_MS, 2000 * 2 ** (intentos.current - 1));
    setEstado({ tipo: "error", mensaje: res.error, reintentoEn: Date.now() + espera });
    programar(espera);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `programar` es estable (solo usa refs)
  }, [assignmentId, periodId]);

  /** Envía ya lo pendiente; la promesa resuelve cuando la cola quedó vacía (o falló). */
  const guardarAhora = useCallback((): Promise<void> => {
    clearTimeout(timer.current);
    cola.current = cola.current.then(enviar);
    return cola.current;
  }, [enviar]);

  function programar(ms: number) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void guardarAhora(), ms);
  }

  const encolar = useCallback(
    (clave: string, cambio: Cambio) => {
      if (bloqueado.current) return;
      pendientes.current.set(clave, cambio);
      setEstado((e) => (e.tipo === "guardando" ? e : { tipo: "pendiente" }));
      if (!enVuelo.current) programar(DEBOUNCE_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `programar` es estable
    [guardarAhora],
  );

  const hayPendientes = useCallback(() => pendientes.current.size > 0 || enVuelo.current, []);

  useEffect(() => {
    const alOcultar = () => {
      if (document.visibilityState === "hidden") void guardarAhora();
    };
    const antesDeSalir = (e: BeforeUnloadEvent) => {
      if (pendientes.current.size > 0 || enVuelo.current) e.preventDefault();
    };
    document.addEventListener("visibilitychange", alOcultar);
    window.addEventListener("beforeunload", antesDeSalir);
    return () => {
      document.removeEventListener("visibilitychange", alOcultar);
      window.removeEventListener("beforeunload", antesDeSalir);
      clearTimeout(timer.current);
    };
  }, [guardarAhora]);

  return { estado, encolar, guardarAhora, hayPendientes };
}
