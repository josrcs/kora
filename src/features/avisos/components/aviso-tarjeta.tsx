import type { ReactNode } from "react";
import { IconMegafono } from "@/components/icons";
import type { AudienciaAviso, TipoAviso } from "@/db/schema";
import type { Aviso } from "../server";

export const TIPO_AVISO: Record<TipoAviso, { texto: string; clase: string; barra: string }> = {
  AVISO: { texto: "Aviso", clase: "border-cielo/30 bg-cielo-soft text-brand", barra: "bg-cielo" },
  COMUNICADO: { texto: "Comunicado", clase: "border-petroleo/25 bg-petroleo-soft text-petroleo", barra: "bg-petroleo" },
  URGENTE: { texto: "Urgente", clase: "border-bad-line bg-bad-soft text-bad", barra: "bg-bad" },
};

export const AUDIENCIA_AVISO: Record<AudienciaAviso, string> = {
  TODOS: "Estudiantes y acudientes",
  ESTUDIANTES: "Solo estudiantes",
  ACUDIENTES: "Solo acudientes",
};

export const fechaAviso = (d: Date) =>
  d.toLocaleString("es-CO", { timeZone: "America/Bogota", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function AvisoTarjeta({ aviso, nuevo = false, pie, atenuado = false }: { aviso: Aviso; nuevo?: boolean; pie?: ReactNode; atenuado?: boolean }) {
  const t = TIPO_AVISO[aviso.tipo];
  return (
    <article
      className={`tarjeta-viva relative overflow-hidden rounded-2xl border bg-surface pl-5 shadow-tarjeta ${atenuado ? "border-line opacity-60" : "border-line"} ${
        nuevo ? "ring-2 ring-cielo/30" : ""
      }`}
    >
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1.5 ${t.barra}`} />
      <div className="px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${t.clase}`}>
            <IconMegafono className="size-3" />
            {t.texto}
          </span>
          {aviso.fijado && <span className="rounded-full bg-navy px-2 py-0.5 text-[11px] font-semibold text-white">Fijado</span>}
          {nuevo && <span className="anim-pop rounded-full bg-cielo px-2 py-0.5 text-[11px] font-semibold text-white">Nuevo</span>}
          <span className="ml-auto text-xs text-muted">{fechaAviso(aviso.fecha)}</span>
        </div>
        <h3 className="mt-2 font-display text-base font-bold text-ink">{aviso.titulo}</h3>
        <p className="mt-1 text-[13px] leading-6 whitespace-pre-line text-ink-soft">{aviso.cuerpo}</p>
        <p className="mt-2 text-xs text-muted">
          {aviso.autor} · Coordinación · {AUDIENCIA_AVISO[aviso.audiencia]}
        </p>
        {pie}
      </div>
    </article>
  );
}
