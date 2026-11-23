import Link from "next/link";
import type { Session } from "@/lib/auth/session";
import { IconMegafono } from "@/components/icons";
import { avisosParaUsuario } from "../server";
import { TIPO_AVISO } from "./aviso-tarjeta";

/** Franja en el portal con los avisos sin leer (urgentes y fijados primero). */
export async function AvisosDestacados({ session }: { session: Session }) {
  const avisos = await avisosParaUsuario(session, 20);
  const sinLeer = avisos.filter((a) => !a.leido);
  if (sinLeer.length === 0) return null;
  const destacado = sinLeer.find((a) => a.tipo === "URGENTE") ?? sinLeer.find((a) => a.fijado) ?? sinLeer[0];
  const t = TIPO_AVISO[destacado.tipo];

  return (
    <Link
      href="/portal/avisos"
      className="anim-entrar group mx-auto mb-5 flex max-w-5xl items-center gap-4 overflow-hidden rounded-2xl border border-cielo/30 bg-gradient-to-r from-brand-soft via-surface to-surface px-4 py-3 shadow-tarjeta transition-shadow hover:shadow-elevada"
    >
      <span className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-white">
        <IconMegafono className="size-5" />
        <span className="anim-pulso absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-cielo text-[10px] font-bold text-white ring-2 ring-surface">
          {sinLeer.length}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${t.clase}`}>{t.texto}</span>
          <span className="text-xs text-muted">
            {sinLeer.length === 1 ? "1 aviso sin leer" : `${sinLeer.length} avisos sin leer`}
          </span>
        </span>
        <span className="mt-0.5 block truncate font-semibold text-ink">{destacado.titulo}</span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-brand transition-transform group-hover:translate-x-1">Ver →</span>
    </Link>
  );
}
