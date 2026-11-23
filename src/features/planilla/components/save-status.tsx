"use client";

import { useEffect, useState } from "react";
import { IconAlert, IconCheck, IconLock, IconSpinner } from "@/components/icons";
import type { EstadoGuardado } from "./use-autosave";

function hace(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "hace un momento";
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.floor(m / 60)} h`;
}

/** Indicador discreto de autoguardado. Anuncia cambios a lectores de pantalla sin interrumpir. */
export function SaveStatus({ estado, onReintentar }: { estado: EstadoGuardado; onReintentar: () => void }) {
  const [ahora, setAhora] = useState(() => Date.now());
  const necesitaReloj = estado.tipo === "guardado" || (estado.tipo === "error" && estado.reintentoEn !== null);

  useEffect(() => {
    if (!necesitaReloj) return;
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [necesitaReloj]);

  let contenido: React.ReactNode;
  switch (estado.tipo) {
    case "inicial":
      contenido = <span className="text-muted">Los cambios se guardan automáticamente</span>;
      break;
    case "pendiente":
      contenido = <span className="text-muted">Cambios sin guardar…</span>;
      break;
    case "guardando":
      contenido = (
        <span className="flex items-center gap-1.5 text-muted">
          <IconSpinner className="size-3.5" /> Guardando…
        </span>
      );
      break;
    case "guardado":
      contenido = (
        <span className="flex items-center gap-1.5 text-ok">
          <IconCheck className="size-3.5" /> Guardado {hace(ahora - estado.en)}
        </span>
      );
      break;
    case "error":
      contenido = (
        <span className="flex items-center gap-1.5 text-bad">
          <IconAlert className="size-3.5" />
          <span className="max-w-72 truncate" title={estado.mensaje}>
            {estado.mensaje}
            {estado.reintentoEn !== null && ` Reintento en ${Math.max(1, Math.ceil((estado.reintentoEn - ahora) / 1000))} s.`}
          </span>
          <button type="button" onClick={onReintentar} className="font-medium underline underline-offset-2 hover:text-ink">
            Reintentar
          </button>
        </span>
      );
      break;
    case "bloqueado":
      contenido = (
        <span className="flex items-center gap-1.5 text-bad">
          <IconLock className="size-3.5" /> <span className="max-w-80 truncate">{estado.mensaje}</span>
        </span>
      );
      break;
  }

  return (
    <div role="status" aria-live="polite" className="text-xs whitespace-nowrap">
      {contenido}
    </div>
  );
}
